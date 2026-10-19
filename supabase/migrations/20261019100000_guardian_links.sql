-- رابط ولي الأمر: each student gets a private read-only page for the family, opened by a long
-- random token (not the student id). Staff copy/send it; only the admin can revoke it and issue
-- a new one. The page reads through one function that takes the token and returns that student
-- only. Also the guardian's name and WhatsApp number on the student.
-- Additive only: the deployed app ignores the new columns, table and functions.

alter table public.students
  add column guardian_name text check (char_length(guardian_name) <= 100),
  -- International format, digits only (e.g. 963912345678), as wa.me expects.
  add column guardian_phone text check (guardian_phone ~ '^[0-9]{7,15}$');

create or replace function private.new_link_token()
returns text
language sql
volatile
set search_path = ''
as $$
  -- 64 hex characters (two v4 uuids, 244 random bits).
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
$$;

create table public.guardian_links (
  student_id uuid primary key references public.students (id) on delete cascade,
  token text not null unique default private.new_link_token() check (char_length(token) >= 32),
  created_at timestamptz not null default now(),
  -- Bumped on every change (new token, page opened) so devices pull it.
  updated_at timestamptz not null default now(),
  last_opened_at timestamptz,
  open_count integer not null default 0
);

create index idx_guardian_links_updated_at on public.guardian_links (updated_at);

-- Staff read the links (to copy them, also offline). Nobody writes them directly.
alter table public.guardian_links enable row level security;
create policy guardian_links_select on public.guardian_links for select to authenticated using (private.is_staff());

-- Every student has a link from the start.
create or replace function private.create_guardian_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.guardian_links (student_id) values (new.id) on conflict (student_id) do nothing;
  return new;
end;
$$;
create trigger trg_students_guardian_link after insert on public.students
  for each row execute function private.create_guardian_link();

insert into public.guardian_links (student_id) select id from public.students on conflict do nothing;

-- Admin: revoke the current link and issue a new one. Returns the new token.
create or replace function public.rotate_guardian_link(p_student_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  if not private.is_admin() then
    raise exception 'تغيير رابط ولي الأمر متاح للمدير فقط';
  end if;
  insert into public.guardian_links (student_id) values (p_student_id)
  on conflict (student_id) do update
    set token = private.new_link_token(), created_at = now(), updated_at = now(), last_opened_at = null, open_count = 0
  returning token into v_token;
  return v_token;
end;
$$;
revoke all on function public.rotate_guardian_link(uuid) from public, anon;
grant execute on function public.rotate_guardian_link(uuid) to authenticated;

-- The guardian page. Anyone holding the token gets this one student's recent record; anything
-- else (wrong, revoked, deleted or archived student) returns null. Visits by staff aren't counted.
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
      where l.circle_id = v_student.circle_id and l.deleted_at is null and l.lesson_date >= v_since), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.guardian_view(text) from public;
grant execute on function public.guardian_view(text) to anon, authenticated;
