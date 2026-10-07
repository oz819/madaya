-- Phase 2b (spec §4.7, §4.8, §5.3, §6): talqeen RPC, report RPC, sync bootstrap helpers and the
-- derived student_progress view. All are SECURITY INVOKER so RLS still applies.

------------------------------------------------------------------------------------------
-- Talqeen: one call saves the session, one TALQEEN entry per ticked student, and attendance.
-- Idempotent (keyed by client uuids) so the offline outbox can retry it safely. Calling it
-- again with a different list adds late arrivals and soft-deletes removed students.
--   p_session: {id, circle_id, session_date, from_surah_no, from_ayah, to_surah_no, to_ayah,
--               notes, edited_at, deleted_at}
--   p_entries: [{id, student_id, notes, quality}]
------------------------------------------------------------------------------------------
create or replace function public.save_talqeen_session(p_session jsonb, p_entries jsonb)
returns void
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  v_id uuid := (p_session ->> 'id')::uuid;
  v_date date := coalesce((p_session ->> 'session_date')::date, current_date);
  v_edited timestamptz := coalesce((p_session ->> 'edited_at')::timestamptz, now());
  v_deleted timestamptz := (p_session ->> 'deleted_at')::timestamptz;
begin
  if not private.is_staff() then
    raise exception 'غير مصرّح';
  end if;

  insert into talqeen_sessions as t
    (id, circle_id, session_date, from_surah_no, from_ayah, to_surah_no, to_ayah, notes, edited_at, deleted_at)
  values
    (v_id, (p_session ->> 'circle_id')::uuid, v_date,
     (p_session ->> 'from_surah_no')::int, (p_session ->> 'from_ayah')::int,
     (p_session ->> 'to_surah_no')::int, (p_session ->> 'to_ayah')::int,
     nullif(p_session ->> 'notes', ''), v_edited, v_deleted)
  on conflict (id) do update set
    circle_id = excluded.circle_id,
    session_date = excluded.session_date,
    from_surah_no = excluded.from_surah_no,
    from_ayah = excluded.from_ayah,
    to_surah_no = excluded.to_surah_no,
    to_ayah = excluded.to_ayah,
    notes = excluded.notes,
    edited_at = excluded.edited_at,
    deleted_at = excluded.deleted_at;

  -- A newer edit of this session already won (last write wins): leave everything as it is.
  if not exists (select 1 from talqeen_sessions where id = v_id and edited_at = v_edited) then
    return;
  end if;

  if v_deleted is not null then
    p_entries := '[]'::jsonb;
  end if;

  insert into quran_entries as q
    (id, student_id, entry_date, track, from_surah_no, from_ayah, to_surah_no, to_ayah,
     quality, notes, talqeen_session_id, edited_at, deleted_at)
  select (e ->> 'id')::uuid, (e ->> 'student_id')::uuid, v_date, 'TALQEEN',
         t.from_surah_no, t.from_ayah, t.to_surah_no, t.to_ayah,
         nullif(e ->> 'quality', ''), nullif(e ->> 'notes', ''), v_id, v_edited, null
  from jsonb_array_elements(p_entries) e
  cross join talqeen_sessions t
  where t.id = v_id
  on conflict (id) do update set
    student_id = excluded.student_id,
    entry_date = excluded.entry_date,
    from_surah_no = excluded.from_surah_no,
    from_ayah = excluded.from_ayah,
    to_surah_no = excluded.to_surah_no,
    to_ayah = excluded.to_ayah,
    quality = excluded.quality,
    notes = excluded.notes,
    edited_at = excluded.edited_at,
    deleted_at = null;

  update quran_entries
  set deleted_at = now(), edited_at = v_edited
  where talqeen_session_id = v_id
    and deleted_at is null
    and id not in (select (e ->> 'id')::uuid from jsonb_array_elements(p_entries) e);

  -- Everyone ticked is present; an existing PRESENT/LATE/EXCUSED mark is kept.
  insert into attendance as a (student_id, att_date, status, edited_at)
  select (e ->> 'student_id')::uuid, v_date, 'PRESENT', v_edited
  from jsonb_array_elements(p_entries) e
  on conflict (student_id, att_date) do update set
    status = 'PRESENT',
    deleted_at = null,
    edited_at = greatest(a.edited_at, excluded.edited_at)
  where a.status = 'ABSENT' or a.deleted_at is not null;
end;
$$;

------------------------------------------------------------------------------------------
-- Reports: every live row in the period for the chosen scope, in one round trip.
-- Formatting (per-day table, range summaries, WhatsApp text) happens on the client.
------------------------------------------------------------------------------------------
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
    select id from students
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
        and t.att_date between p_from and p_to), '[]'::jsonb)
  );
$$;

------------------------------------------------------------------------------------------
-- Sync bootstrap: devices keep only a recent window locally (plus all HIFZ), so they also need
-- each student's latest entry per track / per Arabic book, however old.
------------------------------------------------------------------------------------------
create or replace function public.sync_latest_quran_entries()
returns setof public.quran_entries
language sql
stable
security invoker
set search_path = public
as $$
  select distinct on (student_id, track) *
  from quran_entries
  where deleted_at is null
  order by student_id, track, entry_date desc, created_at desc;
$$;

create or replace function public.sync_latest_arabic_entries()
returns setof public.arabic_entries
language sql
stable
security invoker
set search_path = public
as $$
  select distinct on (student_id, book_id) *
  from arabic_entries
  where deleted_at is null
  order by student_id, book_id, to_page desc, entry_date desc;
$$;

------------------------------------------------------------------------------------------
-- Derived "current position" per student (spec §4.8). The app computes the same values from
-- its local copy so it works offline; this view serves server-side consumers.
------------------------------------------------------------------------------------------
create or replace view public.student_progress
with (security_invoker = true)
as
select
  s.id as student_id,
  s.name,
  s.circle_id,
  h.to_surah_no as hifz_surah_no,
  h.to_ayah as hifz_ayah,
  h.entry_date as hifz_date,
  tl.to_surah_no as tilawa_surah_no,
  tl.to_ayah as tilawa_ayah,
  case when tl.to_surah_no is not null then public.tilawah_percent(tl.to_surah_no, tl.to_ayah) end as tilawa_percent,
  m.from_surah_no as murajaa_from_surah_no,
  m.from_ayah as murajaa_from_ayah,
  m.to_surah_no as murajaa_to_surah_no,
  m.to_ayah as murajaa_to_ayah,
  m.entry_date as murajaa_date,
  tq.from_surah_no as talqeen_from_surah_no,
  tq.from_ayah as talqeen_from_ayah,
  tq.to_surah_no as talqeen_to_surah_no,
  tq.to_ayah as talqeen_to_ayah,
  tq.entry_date as talqeen_date,
  ar.book_id as arabic_book_id,
  ar.to_page as arabic_page,
  round(ar.to_page::numeric / nullif(b.total_pages, 0) * 100)::int as arabic_percent,
  (select max(n.record_date) from public.edu_notes n where n.student_id = s.id and n.deleted_at is null) as last_tarbiya_date,
  att.status as attendance_today
from public.students s
left join lateral (
  select * from public.quran_entries q
  where q.student_id = s.id and q.track = 'HIFZ' and q.deleted_at is null and q.to_surah_no is not null
  order by q.entry_date desc, q.created_at desc limit 1
) h on true
left join lateral (
  select * from public.quran_entries q
  where q.student_id = s.id and q.track = 'TILAWA' and q.deleted_at is null and q.to_surah_no is not null
  order by q.entry_date desc, q.created_at desc limit 1
) tl on true
left join lateral (
  select * from public.quran_entries q
  where q.student_id = s.id and q.track = 'MURAJAA' and q.deleted_at is null
  order by q.entry_date desc, q.created_at desc limit 1
) m on true
left join lateral (
  select * from public.quran_entries q
  where q.student_id = s.id and q.track = 'TALQEEN' and q.deleted_at is null
  order by q.entry_date desc, q.created_at desc limit 1
) tq on true
left join lateral (
  select e.* from public.arabic_entries e
  join public.student_arabic_enrollments en
    on en.student_id = e.student_id and en.book_id = e.book_id and en.deleted_at is null and en.finished_on is null
  where e.student_id = s.id and e.deleted_at is null
  order by e.entry_date desc, e.to_page desc limit 1
) ar on true
left join public.arabic_books b on b.id = ar.book_id
left join public.attendance att on att.student_id = s.id and att.att_date = current_date and att.deleted_at is null;

grant select on public.student_progress to authenticated;
revoke execute on function public.save_talqeen_session(jsonb, jsonb) from public, anon;
revoke execute on function public.report_data(date, date, uuid, uuid) from public, anon;
revoke execute on function public.sync_latest_quran_entries() from public, anon;
revoke execute on function public.sync_latest_arabic_entries() from public, anon;
grant execute on function public.save_talqeen_session(jsonb, jsonb) to authenticated;
grant execute on function public.report_data(date, date, uuid, uuid) to authenticated;
grant execute on function public.sync_latest_quran_entries() to authenticated;
grant execute on function public.sync_latest_arabic_entries() to authenticated;
