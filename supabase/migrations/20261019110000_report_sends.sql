-- إرسال تقارير الحلقة: a mark for each message a teacher sent a family on WhatsApp, so the list
-- shows who still needs theirs (on every device). One row per student, day and kind:
--   DAILY    the day's report          (send_date = that day)
--   MONTHLY  the month's summary       (send_date = the 1st of the month)
--   ABSENCE  the «we missed him» note  (send_date = the day it was sent)
-- Un-marking is a soft delete, like every other synced record.
-- Additive only: the deployed app ignores the new table.

create table public.report_sends (
  student_id uuid not null references public.students (id) on delete cascade,
  send_date date not null,
  kind text not null check (kind in ('DAILY', 'MONTHLY', 'ABSENCE')),
  teacher_id uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  edited_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid,
  primary key (student_id, send_date, kind)
);

create index idx_report_sends_updated_at on public.report_sends (updated_at);
create index idx_report_sends_date on public.report_sends (send_date);

create trigger trg_report_sends_creator before insert or update on public.report_sends
  for each row execute function private.set_creator();
create trigger trg_report_sends_sync before insert or update on public.report_sends
  for each row execute function private.sync_touch();
create trigger trg_report_sends_deleted_by before insert or update on public.report_sends
  for each row execute function private.stamp_deleted_by();

alter table public.report_sends enable row level security;
create policy report_sends_select on public.report_sends for select to authenticated using (private.is_staff());
create policy report_sends_insert on public.report_sends for insert to authenticated with check (private.is_staff());
create policy report_sends_update on public.report_sends for update to authenticated
  using (private.is_staff()) with check (private.is_staff());
