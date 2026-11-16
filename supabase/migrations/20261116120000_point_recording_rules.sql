-- Every dial made with a usable position puts its agent on the map, for everyone.
--
-- * The "too_close" rule is gone. It refused a user's second new point of a network within 25 m in a
--   day, which blocked agents side by side (the first had no cash, so the user went next door) and,
--   worse, blocked the corrected code after a typo, leaving only the wrong point on the map.
--   A wrong point is now taken off by its author (public.delete_my_point).
-- * A user may add up to 10 new points a day (was 5), still enough to stop accidental floods.
-- The signature is unchanged: record_withdrawal() calls it as before.

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
	c_max_new_points_per_day constant integer := 10;
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
end;
$$;

revoke all on function private.assert_can_create_point(uuid, text, extensions.geography, real, timestamptz)
	from public;
