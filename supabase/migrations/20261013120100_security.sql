-- Row Level Security and Data API privileges.
-- Anonymous users get nothing. Signed-in users read public data and only their own private rows.
-- Points and withdrawals are written exclusively through public.record_withdrawal().

alter table public.networks enable row level security;
alter table public.ussd_templates enable row level security;
alter table public.points enable row level security;
alter table public.withdrawals enable row level security;
alter table public.saved_points enable row level security;
alter table public.profiles enable row level security;

revoke all on table
	public.networks,
	public.ussd_templates,
	public.points,
	public.withdrawals,
	public.saved_points,
	public.profiles
from anon, authenticated;

grant select on table public.networks, public.ussd_templates, public.points to authenticated;
grant select on table public.withdrawals to authenticated;
grant select, insert, delete on table public.saved_points to authenticated;
grant select on table public.profiles to authenticated;
grant update (locale, theme, privacy_version, onboarded_at) on table public.profiles to authenticated;

create policy "Signed-in users can read networks"
	on public.networks for select to authenticated
	using (true);

create policy "Signed-in users can read USSD templates"
	on public.ussd_templates for select to authenticated
	using (true);

create policy "Signed-in users can read points"
	on public.points for select to authenticated
	using (true);

create policy "Users can read their own withdrawals"
	on public.withdrawals for select to authenticated
	using (user_id = (select auth.uid()));

create policy "Users can read their saved points"
	on public.saved_points for select to authenticated
	using (user_id = (select auth.uid()));

create policy "Users can save points for themselves"
	on public.saved_points for insert to authenticated
	with check (user_id = (select auth.uid()));

create policy "Users can unsave their own points"
	on public.saved_points for delete to authenticated
	using (user_id = (select auth.uid()));

create policy "Users can read their profile"
	on public.profiles for select to authenticated
	using (id = (select auth.uid()));

create policy "Users can update their profile"
	on public.profiles for update to authenticated
	using (id = (select auth.uid()))
	with check (id = (select auth.uid()));
