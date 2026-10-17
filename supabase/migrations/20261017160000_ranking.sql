-- المتفوقون: points and rankings, computed in the app from what teachers already record, plus
-- the two new inputs it needs:
--   * a grade (التقدير) on a tarbiya note, the periodic «التربية والسلوك» evaluation;
--   * activities (الدورات والأنشطة): a title, a day, a halaqa (or every halaqa) and who attended.
-- And one row of ranking settings the admin edits: item weights, what each grade is worth out of
-- 100, the first day of the week, and when the course started.
-- Additive only: the deployed app ignores the new column, tables and report_data keys.

alter table public.edu_notes
  add column quality text check (quality in ('ممتاز', 'جيد جدًا', 'جيد', 'إعادة', 'تمكين'));

-- Attendees live on the activity row (student_ids), so marking who came is one synced write.
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  title text not null check (btrim(title) <> ''),
  activity_date date not null,
  -- null: an activity for every halaqa.
  circle_id uuid references public.circles (id) on delete cascade,
  student_ids uuid[] not null default '{}',
  teacher_id uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  edited_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid
);

create index idx_activities_updated_at on public.activities (updated_at);
create index idx_activities_date on public.activities (activity_date);
create index idx_activities_teacher on public.activities (teacher_id);
create index idx_activities_circle on public.activities (circle_id);

create trigger trg_activities_creator before insert or update on public.activities
  for each row execute function private.set_creator();
create trigger trg_activities_sync before insert or update on public.activities
  for each row execute function private.sync_touch();
create trigger trg_activities_deleted_by before insert or update on public.activities
  for each row execute function private.stamp_deleted_by();

alter table public.activities enable row level security;
create policy activities_select on public.activities for select to authenticated using (private.is_staff());
create policy activities_insert on public.activities for insert to authenticated with check (private.is_staff());
create policy activities_update on public.activities for update to authenticated
  using (private.is_staff()) with check (private.is_staff());

-- A single row (id = 1). Staff read it; only an admin changes it.
create table public.ranking_settings (
  id smallint primary key default 1 check (id = 1),
  weights jsonb not null default '{"hifz": 40, "tilawa": 20, "attendance": 20, "tarbiya": 10, "activities": 10}'
    check (
      (weights ->> 'hifz')::int >= 0 and (weights ->> 'tilawa')::int >= 0 and (weights ->> 'attendance')::int >= 0
      and (weights ->> 'tarbiya')::int >= 0 and (weights ->> 'activities')::int >= 0
      and (weights ->> 'hifz')::int + (weights ->> 'tilawa')::int + (weights ->> 'attendance')::int
        + (weights ->> 'tarbiya')::int + (weights ->> 'activities')::int = 100
    ),
  grades jsonb not null default '{"ممتاز": 100, "جيد جدًا": 85, "جيد": 70, "تمكين": 60, "إعادة": 40}',
  -- 0 = Sunday … 6 = Saturday (JavaScript's getDay()).
  week_start smallint not null default 6 check (week_start between 0 and 6),
  course_start date,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

alter table public.ranking_settings enable row level security;
create policy ranking_settings_select on public.ranking_settings for select to authenticated using (private.is_staff());
create policy ranking_settings_update on public.ranking_settings for update to authenticated
  using (private.is_admin()) with check (private.is_admin());

create or replace function private.ranking_settings_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
create trigger trg_ranking_settings_touch before update on public.ranking_settings
  for each row execute function private.ranking_settings_touch();

-- The course started when attendance did.
insert into public.ranking_settings (course_start)
select min(att_date) from public.attendance where deleted_at is null;

-- report_data: as before, plus each tarbiya note's grade and the activities of the halaqat in scope.
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
               'area', n.area, 'note', n.note, 'quality', n.quality, 'teacher_id', n.teacher_id)
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
        and l.lesson_date between p_from and p_to), '[]'::jsonb),
    'activities', coalesce((
      select jsonb_agg(to_jsonb(v) order by v.activity_date)
      from activities v
      where (v.circle_id is null or v.circle_id in (select circle_id from st)) and v.deleted_at is null
        and v.activity_date between p_from and p_to), '[]'::jsonb)
  );
$$;
