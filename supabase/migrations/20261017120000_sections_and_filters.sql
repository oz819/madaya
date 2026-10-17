-- Remembered filters: a section (ذكور / إناث) on each halaqa, a default filter per staff account
-- set by the admin, and each user's last chosen filter so it follows them across devices.
-- Additive only: the currently deployed app ignores the new columns and table.
--
-- A filter is a short string: 'all', 's:MALE' / 's:FEMALE' (a section), or 'c:<circle uuid>'.

alter table public.circles
  add column section text check (section in ('MALE', 'FEMALE'));

-- The two existing halaqat are named after their section.
update public.circles set section = 'MALE', edited_at = now() where deleted_at is null and btrim(name) = 'ذكور';
update public.circles set section = 'FEMALE', edited_at = now() where deleted_at is null and btrim(name) = 'إناث';

-- Where the account's pages open until the user picks something else. Edited by the admin only
-- (profiles_update is admin-only).
alter table public.profiles
  add column default_filter text
    check (default_filter ~ '^(all|s:(MALE|FEMALE)|c:[0-9a-f-]{36})$');

-- The user's own last choice. One row per user; each user reads and writes only their own.
create table public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  filter text check (filter ~ '^(all|s:(MALE|FEMALE)|c:[0-9a-f-]{36})$'),
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

create policy user_settings_select on public.user_settings for select to authenticated
  using (user_id = (select auth.uid()));
create policy user_settings_insert on public.user_settings for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_staff());
create policy user_settings_update on public.user_settings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and private.is_staff());
