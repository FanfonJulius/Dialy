-- Withdrawal recording, point queries and account deletion.
-- Client-facing errors use stable message keys (e.g. 'invalid_amount') that the app translates.

-- Private helpers --------------------------------------------------------------

create or replace function private.make_location(p_lat double precision, p_lng double precision)
returns extensions.geography
language plpgsql
immutable
set search_path = ''
as $$
begin
	if p_lat is null and p_lng is null then
		return null;
	end if;
	if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
		raise exception 'invalid_location';
	end if;
	return extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
end;
$$;

create or replace function private.assert_under_daily_withdrawal_limit(
	p_user_id uuid,
	p_captured_at timestamptz
)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
	c_max_withdrawals_per_day constant integer := 30;
begin
	if (
		select count(*)
		  from public.withdrawals w
		 where w.user_id = p_user_id
		   and w.captured_at > p_captured_at - interval '24 hours'
	) >= c_max_withdrawals_per_day then
		raise exception 'daily_withdrawal_limit';
	end if;
end;
$$;

create or replace function private.assert_plausible_movement(
	p_user_id uuid,
	p_location extensions.geography,
	p_captured_at timestamptz
)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
	c_max_speed_m_per_s constant double precision := 200 / 3.6;
	c_min_jump_m constant double precision := 2000;
	v_previous record;
	v_distance_m double precision;
	v_seconds double precision;
begin
	select w.location, w.captured_at
	  into v_previous
	  from public.withdrawals w
	 where w.user_id = p_user_id
	   and w.location is not null
	   and w.captured_at <= p_captured_at
	 order by w.captured_at desc
	 limit 1;

	if not found then
		return;
	end if;

	v_distance_m := extensions.st_distance(v_previous.location, p_location);
	v_seconds := greatest(extract(epoch from p_captured_at - v_previous.captured_at), 1);

	if v_distance_m > c_min_jump_m and v_distance_m / v_seconds > c_max_speed_m_per_s then
		raise exception 'impossible_jump';
	end if;
end;
$$;

create or replace function private.find_same_agent_point(
	p_network_id text,
	p_code text,
	p_location extensions.geography,
	p_radius_m double precision
)
returns public.points
language sql
stable
set search_path = ''
as $$
	select p.*
	  from public.points p
	 where p.network_id = p_network_id
	   and p.code = p_code
	   and p.status = 'active'
	   and extensions.st_dwithin(p.location, p_location, p_radius_m)
	 order by p.location operator(extensions.<->) p_location
	 limit 1;
$$;

create or replace function private.assert_can_create_point(
	p_user_id uuid,
	p_network_id text,
	p_location extensions.geography,
	p_accuracy_m real,
	p_captured_at timestamptz
)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
	c_max_accuracy_m constant real := 100;
	c_max_new_points_per_day constant integer := 5;
	c_too_close_m constant double precision := 25;
	-- Cameroon (west, south, east, north) plus a small border margin.
	c_service_area constant extensions.geometry := extensions.st_makeenvelope(8.0, 1.3, 16.6, 13.4, 4326);
begin
	if p_accuracy_m is null or p_accuracy_m > c_max_accuracy_m then
		raise exception 'location_inaccurate';
	end if;

	if not extensions.st_intersects(p_location::extensions.geometry, c_service_area) then
		raise exception 'outside_service_area';
	end if;

	if (
		select count(*)
		  from public.withdrawals w
		 where w.user_id = p_user_id
		   and w.created_point
		   and w.captured_at > p_captured_at - interval '24 hours'
	) >= c_max_new_points_per_day then
		raise exception 'daily_point_limit';
	end if;

	-- Same user creating another point of the same network right next to their last ones is spam;
	-- different agents side by side (markets) are created by different users.
	if exists (
		select 1
		  from public.withdrawals w
		  join public.points p on p.id = w.point_id
		 where w.user_id = p_user_id
		   and w.created_point
		   and p.network_id = p_network_id
		   and w.captured_at > p_captured_at - interval '24 hours'
		   and extensions.st_dwithin(p.location, p_location, c_too_close_m)
	) then
		raise exception 'too_close';
	end if;
end;
$$;

-- One user can raise a point's public count at most once every 6 hours.
create or replace function private.counts_toward_total(
	p_user_id uuid,
	p_point_id uuid,
	p_captured_at timestamptz
)
returns boolean
language sql
stable
set search_path = ''
as $$
	select not exists (
		select 1
		  from public.withdrawals w
		 where w.user_id = p_user_id
		   and w.point_id = p_point_id
		   and w.counted
		   and w.captured_at > p_captured_at - interval '6 hours'
		   and w.captured_at < p_captured_at + interval '6 hours'
	);
$$;

revoke all on all functions in schema private from public;

-- record_withdrawal ----------------------------------------------------------------

create type public.withdrawal_result as (
	point_id uuid,
	outcome text -- 'created' | 'attached' | 'duplicate'
);

create or replace function public.record_withdrawal(
	p_client_uuid uuid,
	p_network_id text,
	p_code text,
	p_amount integer,
	p_lat double precision default null,
	p_lng double precision default null,
	p_accuracy_m real default null,
	p_captured_at timestamptz default null,
	p_point_id uuid default null
)
returns public.withdrawal_result
language plpgsql
security definer
set search_path = ''
as $$
declare
	c_max_event_age constant interval := interval '7 days';
	-- Phone GPS is often 50-150 m off in markets: the same code this close is the same agent.
	c_same_agent_radius_m constant double precision := 300;
	v_user_id uuid := auth.uid();
	v_network public.networks;
	v_point public.points;
	v_location extensions.geography;
	v_captured_at timestamptz;
	v_existing_point_id uuid;
	v_outcome text := 'attached';
begin
	if v_user_id is null then
		raise exception 'not_authenticated' using errcode = '28000';
	end if;
	if p_client_uuid is null then
		raise exception 'invalid_request';
	end if;

	-- Serialise per user (rate limits) then per agent code (dedupe); always in this order.
	perform pg_advisory_xact_lock(hashtextextended('daily:user:' || v_user_id::text, 0));
	perform pg_advisory_xact_lock(
		hashtextextended('daily:code:' || coalesce(p_network_id, '') || ':' || coalesce(p_code, ''), 0)
	);

	select w.point_id
	  into v_existing_point_id
	  from public.withdrawals w
	 where w.user_id = v_user_id
	   and w.client_uuid = p_client_uuid;
	if found then
		return (v_existing_point_id, 'duplicate')::public.withdrawal_result;
	end if;

	select * into v_network from public.networks n where n.id = p_network_id and n.active;
	if not found then
		raise exception 'invalid_network';
	end if;
	if p_code is null or p_code !~ v_network.code_pattern then
		raise exception 'invalid_code';
	end if;
	if p_amount is null
		or p_amount < v_network.min_amount
		or (v_network.max_amount is not null and p_amount > v_network.max_amount) then
		raise exception 'invalid_amount';
	end if;

	-- Offline events keep their device time, bounded to [now - 7 days, now].
	v_captured_at := least(coalesce(p_captured_at, now()), now());
	if v_captured_at < now() - c_max_event_age then
		raise exception 'stale_event';
	end if;

	v_location := private.make_location(p_lat, p_lng);

	perform private.assert_under_daily_withdrawal_limit(v_user_id, v_captured_at);
	if v_location is not null then
		perform private.assert_plausible_movement(v_user_id, v_location, v_captured_at);
	end if;

	if p_point_id is not null then
		-- Withdrawal from a point the user tapped: never create a new point, wherever the user is.
		select * into v_point from public.points p where p.id = p_point_id and p.status = 'active';
		if not found then
			raise exception 'point_not_found';
		end if;
		if v_point.network_id <> p_network_id or v_point.code <> p_code then
			raise exception 'point_mismatch';
		end if;
	else
		if v_location is null then
			raise exception 'location_required';
		end if;
		v_point := private.find_same_agent_point(p_network_id, p_code, v_location, c_same_agent_radius_m);
		if v_point.id is null then
			perform private.assert_can_create_point(v_user_id, p_network_id, v_location, p_accuracy_m, v_captured_at);
			insert into public.points (network_id, code, location, accuracy_m)
			values (p_network_id, p_code, v_location, p_accuracy_m)
			returning * into v_point;
			v_outcome := 'created';
		elsif p_accuracy_m is not null and p_accuracy_m < v_point.accuracy_m then
			-- The most accurate fix seen so far becomes the point's position.
			update public.points p
			   set location = v_location, accuracy_m = p_accuracy_m
			 where p.id = v_point.id;
		end if;
	end if;

	insert into public.withdrawals (
		client_uuid, user_id, point_id, amount, location, accuracy_m, captured_at, created_point, counted
	)
	values (
		p_client_uuid, v_user_id, v_point.id, p_amount, v_location, p_accuracy_m, v_captured_at,
		v_outcome = 'created', private.counts_toward_total(v_user_id, v_point.id, v_captured_at)
	);

	return (v_point.id, v_outcome)::public.withdrawal_result;
end;
$$;

-- Queries ----------------------------------------------------------------------------

-- Delta sync: pass the last (updated_at, id) seen to page forward. Hidden points are returned
-- (status = 'hidden') so offline copies can drop them.
create or replace function public.points_in_bbox(
	p_west double precision,
	p_south double precision,
	p_east double precision,
	p_north double precision,
	p_since timestamptz default null,
	p_since_id uuid default null,
	p_limit integer default 1000
)
returns table (
	id uuid,
	network_id text,
	code text,
	lat double precision,
	lng double precision,
	accuracy_m real,
	withdrawal_count integer,
	last_withdrawal_at timestamptz,
	status text,
	updated_at timestamptz
)
language sql
stable
set search_path = ''
as $$
	select p.id,
	       p.network_id,
	       p.code,
	       extensions.st_y(p.location::extensions.geometry),
	       extensions.st_x(p.location::extensions.geometry),
	       p.accuracy_m,
	       p.withdrawal_count,
	       p.last_withdrawal_at,
	       p.status,
	       p.updated_at
	  from public.points p
	 where p_west < p_east
	   and p_south < p_north
	   and p.location operator(extensions.&&)
	       extensions.st_makeenvelope(p_west, p_south, p_east, p_north, 4326)::extensions.geography
	   and (
	       p_since is null
	       or (p.updated_at, p.id) > (p_since, coalesce(p_since_id, '00000000-0000-0000-0000-000000000000'::uuid))
	   )
	 order by p.updated_at, p.id
	 limit least(greatest(coalesce(p_limit, 1000), 1), 5000);
$$;

create or replace function public.nearby_points(
	p_lat double precision,
	p_lng double precision,
	p_radius_m double precision default 2000,
	p_limit integer default 50
)
returns table (
	id uuid,
	network_id text,
	code text,
	lat double precision,
	lng double precision,
	accuracy_m real,
	withdrawal_count integer,
	last_withdrawal_at timestamptz,
	updated_at timestamptz,
	distance_m double precision
)
language sql
stable
set search_path = ''
as $$
	with origin as (
		select extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography as location
	)
	select p.id,
	       p.network_id,
	       p.code,
	       extensions.st_y(p.location::extensions.geometry),
	       extensions.st_x(p.location::extensions.geometry),
	       p.accuracy_m,
	       p.withdrawal_count,
	       p.last_withdrawal_at,
	       p.updated_at,
	       extensions.st_distance(p.location, o.location)
	  from public.points p
	 cross join origin o
	 where p.status = 'active'
	   and extensions.st_dwithin(p.location, o.location, least(greatest(coalesce(p_radius_m, 2000), 1), 50000))
	 order by p.location operator(extensions.<->) o.location
	 limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

-- Account deletion (in-app deletion is required by the app stores) -------------------------

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_user_id uuid := auth.uid();
begin
	if v_user_id is null then
		raise exception 'not_authenticated' using errcode = '28000';
	end if;
	-- Cascades to profile, withdrawals and saved points. Public points hold no user data and stay.
	delete from auth.users u where u.id = v_user_id;
end;
$$;

-- Only signed-in users may call the API functions (Supabase grants new functions to anon by default).
revoke all on function public.record_withdrawal(
	uuid, text, text, integer, double precision, double precision, real, timestamptz, uuid
) from public, anon, authenticated;
grant execute on function public.record_withdrawal(
	uuid, text, text, integer, double precision, double precision, real, timestamptz, uuid
) to authenticated;

revoke all on function public.points_in_bbox(
	double precision, double precision, double precision, double precision, timestamptz, uuid, integer
) from public, anon, authenticated;
grant execute on function public.points_in_bbox(
	double precision, double precision, double precision, double precision, timestamptz, uuid, integer
) to authenticated;

revoke all on function public.nearby_points(double precision, double precision, double precision, integer)
	from public, anon, authenticated;
grant execute on function public.nearby_points(double precision, double precision, double precision, integer)
	to authenticated;

revoke all on function public.delete_my_account() from public, anon, authenticated;
grant execute on function public.delete_my_account() to authenticated;
