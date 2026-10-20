-- الاختبارات والشهادات: an exam per student (a juz', a surah, or the monthly سبر) with the date,
-- the examiner, the score out of 100, pass/fail and notes. Passing a juz' exam gives a printable
-- certificate (in the app). Exams are an optional item of the ranking, weighted by the admin
-- (0% by default, so the current ranking doesn't change).
-- Additive: the exams table, the pass mark setting, an 'exams' weight allowed (missing = 0),
-- and the exams in report_data() and guardian_view().

create table public.exams (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  exam_date date not null,
  kind text not null check (kind in ('JUZ', 'SURAH', 'MONTHLY')),
  juz_no smallint check (juz_no between 1 and 30),
  surah_no integer references public.quran_surahs (surah_no),
  examiner text check (char_length(examiner) <= 100),
  score numeric(5, 2) not null check (score between 0 and 100),
  -- Decided with the pass mark in force when the exam was recorded.
  passed boolean not null,
  notes text check (char_length(notes) <= 1000),
  teacher_id uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  edited_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid,
  check ((kind = 'JUZ') = (juz_no is not null)),
  check ((kind = 'SURAH') = (surah_no is not null))
);

create index idx_exams_updated_at on public.exams (updated_at);
create index idx_exams_student on public.exams (student_id, exam_date);
create index idx_exams_teacher on public.exams (teacher_id);

create trigger trg_exams_creator before insert or update on public.exams
  for each row execute function private.set_creator();
create trigger trg_exams_sync before insert or update on public.exams
  for each row execute function private.sync_touch();
create trigger trg_exams_deleted_by before insert or update on public.exams
  for each row execute function private.stamp_deleted_by();

alter table public.exams enable row level security;
create policy exams_select on public.exams for select to authenticated using (private.is_staff());
create policy exams_insert on public.exams for insert to authenticated with check (private.is_staff());
create policy exams_update on public.exams for update to authenticated
  using (private.is_staff()) with check (private.is_staff());

alter table public.ranking_settings
  add column pass_mark smallint not null default 70 check (pass_mark between 1 and 100);

-- Weights may now include 'exams'; a missing key counts as 0, so existing rows stay valid.
alter table public.ranking_settings drop constraint ranking_settings_weights_check;
alter table public.ranking_settings add constraint ranking_settings_weights_check check (
  (weights ->> 'hifz')::int >= 0 and (weights ->> 'tilawa')::int >= 0 and (weights ->> 'attendance')::int >= 0
  and (weights ->> 'tarbiya')::int >= 0 and (weights ->> 'activities')::int >= 0
  and coalesce((weights ->> 'exams')::int, 0) >= 0
  and (weights ->> 'hifz')::int + (weights ->> 'tilawa')::int + (weights ->> 'attendance')::int
    + (weights ->> 'tarbiya')::int + (weights ->> 'activities')::int + coalesce((weights ->> 'exams')::int, 0) = 100
);

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
        and v.activity_date between p_from and p_to), '[]'::jsonb),
    'exams', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.exam_date)
      from exams x
      where x.student_id in (select id from st) and x.deleted_at is null
        and x.exam_date between p_from and p_to), '[]'::jsonb)
  );
$$;

create or replace function public.guardian_view(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_student public.students;
  v_circle public.circles;
  v_since date := (now() at time zone 'Asia/Damascus')::date - 13;
  v_month date := (now() at time zone 'Asia/Damascus')::date - 29;
  v_today date := (now() at time zone 'Asia/Damascus')::date;
  v_week date;
begin
  if p_token is null or char_length(p_token) < 32 then
    return null;
  end if;
  select s.* into v_student
  from public.guardian_links g join public.students s on s.id = g.student_id
  where g.token = p_token and s.deleted_at is null and s.active;
  if not found then
    return null;
  end if;
  select * into v_circle from public.circles where id = v_student.circle_id;
  -- The week starts on the day set in the ranking settings (0 Sunday … 6 Saturday).
  select v_today - ((extract(dow from v_today)::int - coalesce(week_start, 6) + 7) % 7) into v_week
  from public.ranking_settings where id = 1;
  v_week := coalesce(v_week, v_today - ((extract(dow from v_today)::int - 6 + 7) % 7));

  if not coalesce(private.is_staff(), false) then
    update public.guardian_links
    set last_opened_at = now(), open_count = open_count + 1, updated_at = now()
    where student_id = v_student.id;
  end if;

  return jsonb_build_object(
    'student', jsonb_build_object('name', v_student.name, 'circle', v_circle.name, 'section', v_circle.section),
    'surahs', (select jsonb_agg(jsonb_build_object('surah_no', surah_no, 'name', name, 'ayah_count', ayah_count) order by surah_no)
               from public.quran_surahs),
    'hifz', coalesce((
      select jsonb_agg(jsonb_build_object('entry_date', q.entry_date, 'from_surah_no', q.from_surah_no, 'from_ayah', q.from_ayah,
                                          'to_surah_no', q.to_surah_no, 'to_ayah', q.to_ayah) order by q.entry_date)
      from public.quran_entries q
      where q.student_id = v_student.id and q.deleted_at is null and q.track = 'HIFZ'), '[]'::jsonb),
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object('entry_date', q.entry_date, 'track', q.track, 'from_surah_no', q.from_surah_no,
                                          'from_ayah', q.from_ayah, 'to_surah_no', q.to_surah_no, 'to_ayah', q.to_ayah,
                                          'quality', q.quality) order by q.entry_date desc, q.created_at)
      from public.quran_entries q
      where q.student_id = v_student.id and q.deleted_at is null and q.entry_date >= v_since), '[]'::jsonb),
    'attendance', coalesce((
      select jsonb_agg(jsonb_build_object('att_date', a.att_date, 'status', a.status) order by a.att_date desc)
      from public.attendance a
      where a.student_id = v_student.id and a.deleted_at is null and a.att_date >= v_month), '[]'::jsonb),
    'lessons', coalesce((
      select jsonb_agg(jsonb_build_object('lesson_date', l.lesson_date, 'title', l.title) order by l.lesson_date desc)
      from public.circle_lessons l
      where l.circle_id = v_student.circle_id and l.deleted_at is null and l.lesson_date >= v_since), '[]'::jsonb),
    -- هدف الأسبوع: distinct ayat memorized since the week started, against the goal.
    'goal', case when v_student.weekly_goal_ayahs is null then null else jsonb_build_object(
      'weekly_ayahs', v_student.weekly_goal_ayahs,
      'done', (select count(distinct i)
               from public.quran_entries q,
                    generate_series(public.ayahs_before(q.from_surah_no) + q.from_ayah, public.ayahs_before(q.to_surah_no) + q.to_ayah) i
               where q.student_id = v_student.id and q.deleted_at is null and q.track = 'HIFZ' and q.entry_date >= v_week)) end,
    -- The last exams, newest first.
    'exams', coalesce((
      select jsonb_agg(jsonb_build_object('exam_date', x.exam_date, 'kind', x.kind, 'juz_no', x.juz_no, 'surah_no', x.surah_no,
                                          'score', x.score, 'passed', x.passed) order by x.exam_date desc)
      from (select * from public.exams where student_id = v_student.id and deleted_at is null
            order by exam_date desc, created_at desc limit 10) x), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.guardian_view(text) from public;
grant execute on function public.guardian_view(text) to anon, authenticated;
