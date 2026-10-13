-- Daily core schema: reference data, public points, private withdrawals, saved points, profiles.

create extension if not exists postgis with schema extensions;

-- Internal helpers live outside the API-exposed schemas.
create schema if not exists private;
revoke all on schema private from public;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	new.updated_at := clock_timestamp();
	return new;
end;
$$;

-- Reference data -------------------------------------------------------------

create table public.networks (
	id text primary key check (id ~ '^[a-z][a-z0-9_]{1,31}$'),
	name text not null check (char_length(name) between 1 and 40),
	color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
	-- Evaluating the pattern rejects invalid regular expressions at write time.
	code_pattern text not null check (code_pattern <> '' and ('' ~ code_pattern) is not null),
	min_amount integer not null check (min_amount > 0),
	max_amount integer check (max_amount is null or max_amount >= min_amount),
	quick_amounts integer[] not null default '{}' check (0 < all (quick_amounts)),
	sort_order smallint not null default 0,
	active boolean not null default true,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

comment on column public.networks.max_amount is 'NULL means no maximum.';

create table public.ussd_templates (
	id uuid primary key default gen_random_uuid(),
	network_id text not null references public.networks (id) on update cascade,
	kind text not null default 'withdrawal' check (kind in ('withdrawal')),
	-- Only digits, * and # around exactly the {code} and {amount} placeholders.
	template text not null check (
		template ~ '^[*#]'
		and template ~ '#$'
		and position('{code}' in template) > 0
		and position('{amount}' in template) > 0
		and regexp_replace(template, '\{(code|amount)\}', '', 'g') ~ '^[0-9*#]+$'
	),
	active boolean not null default true,
	notes text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create unique index ussd_templates_one_active_per_kind
	on public.ussd_templates (network_id, kind)
	where active;

-- Points (public) -------------------------------------------------------------

create table public.points (
	id uuid primary key default gen_random_uuid(),
	network_id text not null references public.networks (id) on update cascade,
	code text not null check (code ~ '^[0-9]{1,32}$'),
	location extensions.geography(point, 4326) not null,
	accuracy_m real not null check (accuracy_m >= 0),
	withdrawal_count integer not null default 0 check (withdrawal_count >= 0),
	last_withdrawal_at timestamptz,
	status text not null default 'active' check (status in ('active', 'hidden')),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

comment on table public.points is
	'Public withdrawal points. Never add user columns: who withdrew must never be exposed. Hide points (status) instead of deleting them so offline clients receive the change.';

create index points_location_idx on public.points using gist (location);
create index points_updated_at_id_idx on public.points (updated_at, id);
create index points_network_code_idx on public.points (network_id, code);

-- Withdrawals (private to their user) -----------------------------------------

create table public.withdrawals (
	id uuid primary key default gen_random_uuid(),
	client_uuid uuid not null,
	user_id uuid not null references auth.users (id) on delete cascade,
	point_id uuid not null references public.points (id) on delete cascade,
	amount integer not null check (amount > 0),
	location extensions.geography(point, 4326),
	accuracy_m real check (accuracy_m >= 0),
	captured_at timestamptz not null,
	created_point boolean not null default false,
	counted boolean not null default false,
	created_at timestamptz not null default now(),
	constraint withdrawals_user_client_uuid_key unique (user_id, client_uuid)
);

comment on column public.withdrawals.client_uuid is 'Generated on the device; makes offline retries idempotent.';
comment on column public.withdrawals.counted is 'Whether this withdrawal raised the point''s public withdrawal_count.';

create index withdrawals_user_captured_at_idx on public.withdrawals (user_id, captured_at desc);
create index withdrawals_point_user_idx on public.withdrawals (point_id, user_id, captured_at desc);

-- Saved points ----------------------------------------------------------------

create table public.saved_points (
	user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
	point_id uuid not null references public.points (id) on delete cascade,
	created_at timestamptz not null default now(),
	primary key (user_id, point_id)
);

create index saved_points_point_id_idx on public.saved_points (point_id);

-- Profiles --------------------------------------------------------------------

create table public.profiles (
	id uuid primary key references auth.users (id) on delete cascade,
	locale text check (locale in ('en', 'fr')),
	theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
	privacy_version integer check (privacy_version > 0),
	onboarded_at timestamptz,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

-- Triggers ----------------------------------------------------------------------

-- clock_timestamp() on insert too, so rows written in one transaction get ordered sync cursors.
create trigger networks_set_updated_at before insert or update on public.networks
	for each row execute function private.set_updated_at();
create trigger ussd_templates_set_updated_at before insert or update on public.ussd_templates
	for each row execute function private.set_updated_at();
create trigger points_set_updated_at before insert or update on public.points
	for each row execute function private.set_updated_at();
create trigger profiles_set_updated_at before insert or update on public.profiles
	for each row execute function private.set_updated_at();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
	return new;
end;
$$;

create trigger on_auth_user_created
	after insert on auth.users
	for each row execute function private.handle_new_user();

create or replace function private.apply_withdrawal_to_point()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	update public.points p
	   set withdrawal_count = p.withdrawal_count + (case when new.counted then 1 else 0 end),
	       last_withdrawal_at = greatest(p.last_withdrawal_at, new.captured_at)
	 where p.id = new.point_id
	   and (new.counted or p.last_withdrawal_at is null or p.last_withdrawal_at < new.captured_at);
	return null;
end;
$$;

create trigger withdrawals_apply_to_point
	after insert on public.withdrawals
	for each row execute function private.apply_withdrawal_to_point();

revoke all on all functions in schema private from public;
