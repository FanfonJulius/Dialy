-- Delta sync by map cell, answered from an index built for it.
--
-- The app syncs points cell by cell (z12 tiles, about 10 km wide) every time the map settles, at most
-- every 2 minutes per cell. points_in_bbox reads every point of the box through the spatial index and
-- sorts them on every call, so its cost grows with the number of points in a city, on every map move
-- of every user. With (sync_cell, updated_at, id) a sync reads only the rows that changed since the
-- cursor, usually none: one short index range scan whatever the size of the city.
-- points_in_bbox stays for app versions released before this one.

-- The z12 tile x * 4096 + y holding a location: the cell the app computes with cellOf()
-- (src/lib/sync/points-sync.ts, src/lib/domain/tiles.ts), using the same formula and clamping.
create or replace function private.sync_cell(p_location extensions.geography)
returns integer
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
	select least(4095, greatest(0, floor((c.lng + 180) / 360 * 4096)))::integer * 4096
	     + least(4095, greatest(0, floor(
	           (1 - ln(tan(c.lat * pi() / 180) + 1 / cos(c.lat * pi() / 180)) / pi()) / 2 * 4096
	       )))::integer
	  from (
		select extensions.st_x(p_location::extensions.geometry) as lng,
		       greatest(-85.0511287798, least(85.0511287798, extensions.st_y(p_location::extensions.geometry))) as lat
	  ) c;
$$;

revoke all on function private.sync_cell(extensions.geography) from public;

-- Kept up to date by Postgres when a point moves to a more accurate fix. Adding it rewrites the table
-- without firing row triggers, so updated_at (the sync cursor) does not change for existing points.
-- "if not exists": safe to run again (e.g. from the dashboard's SQL editor).
alter table public.points
	add column if not exists sync_cell integer generated always as (private.sync_cell(location)) stored;

create index if not exists points_sync_cell_idx on public.points (sync_cell, updated_at, id);

-- Same rows and paging as points_in_bbox: pass the last (updated_at, id) seen to page forward.
-- Hidden points are returned (status = 'hidden') so offline copies can drop them.
-- Postgres plans this body once for any arguments (set search_path stops inlining), so the cursor is a
-- single row comparison, never "p_since is null or ...": that way it bounds the index scan instead of
-- filtering every row of the cell. updated_at is never null, so '-infinity' returns the whole cell.
create or replace function public.points_in_cell(
	p_x integer,
	p_y integer,
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
	 where p_x between 0 and 4095
	   and p_y between 0 and 4095
	   and p.sync_cell = p_x * 4096 + p_y
	   and (p.updated_at, p.id) > (
	       coalesce(p_since, '-infinity'::timestamptz),
	       coalesce(p_since_id, '00000000-0000-0000-0000-000000000000'::uuid)
	   )
	 order by p.updated_at, p.id
	 limit least(greatest(coalesce(p_limit, 1000), 1), 5000);
$$;

revoke all on function public.points_in_cell(integer, integer, timestamptz, uuid, integer)
	from public, anon, authenticated;
grant execute on function public.points_in_cell(integer, integer, timestamptz, uuid, integer) to authenticated;
