-- The signed-in user's withdrawals with their points, newest first, for the History screen
-- (also on a new phone, and for withdrawals made before the phone kept a history).

create or replace function public.my_withdrawals()
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
	status text
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
	       p.status
	  from public.withdrawals w
	  join public.points p on p.id = w.point_id
	 where w.user_id = (select auth.uid())
	 order by w.captured_at desc
	 limit 500;
$$;

revoke all on function public.my_withdrawals() from public, anon, authenticated;
grant execute on function public.my_withdrawals() to authenticated;
