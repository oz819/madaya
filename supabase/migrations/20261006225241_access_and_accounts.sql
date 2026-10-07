-- Phase 1 (spec §3): close self-signup, drop the USER role, and widen access so that every
-- active teacher sees and edits every student. Admin-only actions stay admin-only.

-- Self-signup auto-provisioning is gone: only admin-created accounts get a profile.
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists private.handle_new_user();

-- Any leftover self-signup profile becomes a *disabled* teacher, so nothing is deleted
-- implicitly; the admin can enable (or remove) it from the Manage screen.
update public.profiles set role = 'TEACHER', active = false where role = 'USER';

alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('ADMIN', 'TEACHER'));

-- "Staff" = an active ADMIN or TEACHER. This is the single access rule for student data now.
create or replace function private.is_staff()
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select exists(select 1 from profiles where id = auth.uid() and role in ('ADMIN', 'TEACHER') and active);
$$;
revoke all on function private.is_staff() from public;
grant execute on function private.is_staff() to authenticated, service_role;

-- Kept with their old signatures so existing policies keep compiling; the argument no longer
-- matters because access is no longer per-circle.
create or replace function private.can_access_circle(target_circle_id uuid)
returns boolean
language sql
stable security definer
set search_path = public, private
as $$
  select private.is_staff();
$$;

create or replace function private.can_access_student(target_student_id uuid)
returns boolean
language sql
stable security definer
set search_path = public, private
as $$
  select private.is_staff();
$$;

drop function if exists private.owns_circle(uuid);

-- Teachers need to see each other's names (who recorded an entry); only the admin edits profiles.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (private.is_staff() or id = (select auth.uid()));
