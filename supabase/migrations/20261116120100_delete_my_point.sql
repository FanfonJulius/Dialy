-- Whoever put a point on the map can take it off again (e.g. after typing a wrong agent code), so
-- nobody else walks to an agent that isn't there. Only the withdrawal that created the point proves
-- who added it; that link stays private: other users never learn who added or removed a point.

-- Hidden, never deleted: offline copies learn about it through the delta sync (status = 'hidden'),
-- withdrawals keep their point, and a later dial of the right code there creates a fresh point.
create or replace function public.delete_my_point(p_point_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_user_id uuid := auth.uid();
	v_status text;
begin
	if v_user_id is null then
		raise exception 'not_authenticated' using errcode = '28000';
	end if;

	select p.status into v_status from public.points p where p.id = p_point_id for update;
	if not found then
		raise exception 'point_not_found';
	end if;

	if not exists (
		select 1
		  from public.withdrawals w
		 where w.point_id = p_point_id
		   and w.user_id = v_user_id
		   and w.created_point
	) then
		raise exception 'not_point_creator';
	end if;

	-- Already hidden: nothing to do, so retries from the app's outbox are harmless.
	if v_status = 'active' then
		update public.points p set status = 'hidden' where p.id = p_point_id;
	end if;
end;
$$;

revoke all on function public.delete_my_point(uuid) from public, anon, authenticated;
grant execute on function public.delete_my_point(uuid) to authenticated;

-- my_withdrawals() also says which withdrawals created their point, so the app knows (for the
-- signed-in user only) which points they may delete. Adding a column needs a new function; "if exists"
-- because databases that never ran 20261017120000_withdrawal_history.sql have none yet (this one replaces it).
drop function if exists public.my_withdrawals();

create function public.my_withdrawals()
returns table (
	client_uuid uuid,
	amount integer,
	captured_at timestamptz,
	point_id uuid,
	network_id text,
	code text,
	lat double precision,
	lng double precision,
	accuracy_m real,
	withdrawal_count integer,
	last_withdrawal_at timestamptz,
	updated_at timestamptz,
	status text,
	created_point boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
	select w.client_uuid,
	       w.amount,
	       w.captured_at,
	       p.id,
	       p.network_id,
	       p.code,
	       extensions.st_y(p.location::extensions.geometry),
	       extensions.st_x(p.location::extensions.geometry),
	       p.accuracy_m,
	       p.withdrawal_count,
	       p.last_withdrawal_at,
	       p.updated_at,
	       p.status,
	       w.created_point
	  from public.withdrawals w
	  join public.points p on p.id = w.point_id
	 where w.user_id = (select auth.uid())
	 order by w.captured_at desc
	 limit 500;
$$;

revoke all on function public.my_withdrawals() from public, anon, authenticated;
grant execute on function public.my_withdrawals() to authenticated;
