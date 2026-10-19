-- هدف الحفظ الأسبوعي (المرحلة 13): an optional number of new ayat per week for a student, set by
-- the teacher. The family's page shows this week's progress against it.
-- Additive: a nullable column, and guardian_view() also returns the goal.

alter table public.students
  add column weekly_goal_ayahs smallint check (weekly_goal_ayahs between 1 and 1000);

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
               where q.student_id = v_student.id and q.deleted_at is null and q.track = 'HIFZ' and q.entry_date >= v_week)) end
  );
end;
$$;
revoke all on function public.guardian_view(text) from public;
grant execute on function public.guardian_view(text) to anon, authenticated;
