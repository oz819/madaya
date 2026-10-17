-- درس اليوم: the lesson a halaqa was given on a day, written once for the whole halaqa and shown
-- for every student who attended. One row per (halaqa, day), like attendance per (student, day),
-- so two teachers saving the same day offline can't create duplicates: last edit wins.
-- Additive: report_data gains a 'lessons' key the deployed app ignores.

create table public.circle_lessons (
  circle_id uuid not null references public.circles (id) on delete cascade,
  lesson_date date not null,
  title text not null check (btrim(title) <> ''),
  teacher_id uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  edited_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid,
  primary key (circle_id, lesson_date)
);

create index idx_circle_lessons_updated_at on public.circle_lessons (updated_at);
create index idx_circle_lessons_date on public.circle_lessons (lesson_date);
create index idx_circle_lessons_teacher on public.circle_lessons (teacher_id);

create trigger trg_circle_lessons_creator before insert or update on public.circle_lessons
  for each row execute function private.set_creator();
create trigger trg_circle_lessons_sync before insert or update on public.circle_lessons
  for each row execute function private.sync_touch();
create trigger trg_circle_lessons_deleted_by before insert or update on public.circle_lessons
  for each row execute function private.stamp_deleted_by();

alter table public.circle_lessons enable row level security;
create policy circle_lessons_select on public.circle_lessons for select to authenticated using (private.is_staff());
create policy circle_lessons_insert on public.circle_lessons for insert to authenticated with check (private.is_staff());
create policy circle_lessons_update on public.circle_lessons for update to authenticated
  using (private.is_staff()) with check (private.is_staff());

-- report_data: same as before, plus the lessons of the halaqat in scope.
create or replace function public.report_data(
  p_from date,
  p_to date,
  p_circle_id uuid default null,
  p_student_id uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with st as (
    select id, circle_id from students
    where (p_student_id is null or id = p_student_id)
      and (p_circle_id is null or circle_id = p_circle_id)
  )
  select jsonb_build_object(
    'quran', coalesce((
      select jsonb_agg(to_jsonb(q) order by q.entry_date, q.created_at)
      from quran_entries q
      where q.student_id in (select id from st) and q.deleted_at is null
        and q.entry_date between p_from and p_to), '[]'::jsonb),
    'arabic', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.entry_date, a.created_at)
      from arabic_entries a
      where a.student_id in (select id from st) and a.deleted_at is null
        and a.entry_date between p_from and p_to), '[]'::jsonb),
    'tarbiya', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', n.id, 'student_id', n.student_id, 'record_date', n.record_date,
               'area', n.area, 'note', n.note, 'teacher_id', n.teacher_id)
             order by n.record_date, n.created_at)
      from edu_notes n
      where n.student_id in (select id from st) and n.deleted_at is null
        and n.record_date between p_from and p_to), '[]'::jsonb),
    'attendance', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.att_date)
      from attendance t
      where t.student_id in (select id from st) and t.deleted_at is null
        and t.att_date between p_from and p_to), '[]'::jsonb),
    'lessons', coalesce((
      select jsonb_agg(to_jsonb(l) order by l.lesson_date)
      from circle_lessons l
      where l.circle_id in (select circle_id from st) and l.deleted_at is null
        and l.lesson_date between p_from and p_to), '[]'::jsonb)
  );
$$;
