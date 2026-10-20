-- سجل التعديلات: every insert, change, delete and restore on the data tables, recorded inside the
-- database by triggers (so no write path can skip it): who, when, which row, and for a change only
-- the fields that changed, as [before, after]. Re-sent offline writes that change nothing aren't
-- recorded. Only the admin reads it. It starts now; earlier edits have no history.
-- Additive only: a new table, a function, and AFTER triggers that never block a write.

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  table_name text not null,
  row_key text not null,
  student_id uuid,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE', 'RESTORE')),
  -- INSERT/DELETE: the row's fields; UPDATE/RESTORE: {"field": [before, after]}.
  changes jsonb not null
);

create index idx_audit_log_at on public.audit_log (at desc);
create index idx_audit_log_actor on public.audit_log (actor, at desc);
create index idx_audit_log_table on public.audit_log (table_name, at desc);
create index idx_audit_log_student on public.audit_log (student_id, at desc);

alter table public.audit_log enable row level security;
create policy audit_log_select on public.audit_log for select to authenticated using (private.is_admin());

-- TG_ARGV: the row's key columns.
create or replace function private.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Bookkeeping columns: who/when is the log entry itself.
  v_skip text[] := array['updated_at', 'edited_at', 'updated_by', 'created_at', 'deleted_by', 'teacher_id'];
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_changes jsonb := '{}'::jsonb;
  v_action text := tg_op;
  v_key text := '';
  v_col text;
  k text;
begin
  foreach v_col in array tg_argv loop
    v_key := v_key || case when v_key = '' then '' else '|' end || coalesce(v_row ->> v_col, '');
  end loop;

  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(v_new) loop
      if not (k = any (v_skip)) and (v_new -> k) is distinct from (v_old -> k) then
        v_changes := v_changes || jsonb_build_object(k, jsonb_build_array(v_old -> k, v_new -> k));
      end if;
    end loop;
    if v_changes = '{}'::jsonb then
      return null;
    end if;
    if v_changes ? 'deleted_at' then
      v_action := case when v_new ->> 'deleted_at' is null then 'RESTORE' else 'DELETE' end;
    end if;
  else
    v_changes := jsonb_strip_nulls(v_row) - v_skip;
  end if;

  insert into public.audit_log (actor, table_name, row_key, student_id, action, changes)
  values (
    auth.uid(),
    tg_table_name,
    v_key,
    case when tg_table_name = 'students' then (v_row ->> 'id')::uuid else (v_row ->> 'student_id')::uuid end,
    v_action,
    v_changes
  );
  return null;
end;
$$;

create trigger trg_audit after insert or update or delete on public.students for each row execute function private.audit_row('id');
create trigger trg_audit after insert or update or delete on public.circles for each row execute function private.audit_row('id');
create trigger trg_audit after insert or update or delete on public.profiles for each row execute function private.audit_row('id');
create trigger trg_audit after insert or update or delete on public.quran_entries for each row execute function private.audit_row('id');
create trigger trg_audit after insert or update or delete on public.attendance for each row execute function private.audit_row('student_id', 'att_date');
create trigger trg_audit after insert or update or delete on public.arabic_books for each row execute function private.audit_row('id');
create trigger trg_audit after insert or update or delete on public.student_arabic_enrollments for each row execute function private.audit_row('id');
create trigger trg_audit after insert or update or delete on public.arabic_entries for each row execute function private.audit_row('id');
create trigger trg_audit after insert or update or delete on public.edu_notes for each row execute function private.audit_row('id');
create trigger trg_audit after insert or update or delete on public.talqeen_sessions for each row execute function private.audit_row('id');
create trigger trg_audit after insert or update or delete on public.circle_lessons for each row execute function private.audit_row('circle_id', 'lesson_date');
create trigger trg_audit after insert or update or delete on public.activities for each row execute function private.audit_row('id');
create trigger trg_audit after insert or update or delete on public.exams for each row execute function private.audit_row('id');
create trigger trg_audit after insert or update or delete on public.ranking_settings for each row execute function private.audit_row('id');
