-- Saved points with their details, so a new device can show them before syncing that area.

create or replace function public.my_saved_points()
returns table (
	point_id uuid,
	saved_at timestamptz,
	network_id text,
	code text,
	lat double precision,
	lng double precision,
	accuracy_m real,
	withdrawal_count integer,
	last_withdrawal_at timestamptz,
	updated_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
	select p.id,
	       s.created_at,
	       p.network_id,
	       p.code,
	       extensions.st_y(p.location::extensions.geometry),
	       extensions.st_x(p.location::extensions.geometry),
	       p.accuracy_m,
	       p.withdrawal_count,
	       p.last_withdrawal_at,
	       p.updated_at
	  from public.saved_points s
	  join public.points p on p.id = s.point_id
	 where s.user_id = (select auth.uid())
	   and p.status = 'active'
	 order by s.created_at desc
	 limit 500;
$$;

revoke all on function public.my_saved_points() from public, anon, authenticated;
grant execute on function public.my_saved_points() to authenticated;
