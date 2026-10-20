-- نقل طالب بين الحلقات مع حفظ تاريخه: every change of a student's halaqa is recorded (from, to, and
-- the first day in the new one) by a trigger, so it can't be missed by any write path. The app
-- then counts each record towards the halaqa the student was in on that record's day: old
-- rankings, attendance and report numbers stay with the old halaqa instead of moving with them.
-- The day is the edit's own day (edited_at, set on the device), so a change made offline and
-- synced later keeps its real date.
-- Additive only: a new table synced to devices (read-only for them) and a trigger.

create table public.student_transfers (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  from_circle_id uuid references public.circles (id) on delete set null,
  to_circle_id uuid references public.circles (id) on delete set null,
  -- First day in the new halaqa.
  transfer_date date not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index idx_student_transfers_student on public.student_transfers (student_id, transfer_date);
create index idx_student_transfers_updated_at on public.student_transfers (updated_at);

alter table public.student_transfers enable row level security;
create policy student_transfers_select on public.student_transfers for select to authenticated using (private.is_staff());

create or replace function private.record_student_transfer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.circle_id is distinct from old.circle_id then
    insert into public.student_transfers (student_id, from_circle_id, to_circle_id, transfer_date, created_by)
    values (new.id, old.circle_id, new.circle_id, (coalesce(new.edited_at, now()) at time zone 'Asia/Damascus')::date, auth.uid());
  end if;
  return null;
end;
$$;

create trigger trg_students_transfer after update of circle_id on public.students
  for each row execute function private.record_student_transfer();
