-- Phase 2 (spec §4, §7, §9): independent tracks, attendance, talqeen, Arabic books, and the
-- audit/sync columns every offline-syncable table needs.
--
-- Sync conventions (every syncable table):
--   id          client-generated uuid (attendance uses its natural key instead)
--   updated_at  set by the server on every write; the pull cursor
--   updated_by  set by the server to auth.uid()
--   edited_at   set by the client when the user made the change; last write wins on it
--   deleted_at  soft delete

------------------------------------------------------------------------------------------
-- Shared trigger functions
------------------------------------------------------------------------------------------

-- Stamps updated_at/updated_by and enforces last-write-wins by the client's edited_at: an
-- update carrying an older edit than the stored row is skipped (returns null), so a device
-- that syncs late can't overwrite a newer edit made elsewhere.
create or replace function private.sync_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.edited_at < old.edited_at then
    return null;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

-- teacher_id is "who created it": the caller on insert, immutable afterwards.
create or replace function private.set_creator()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.teacher_id := coalesce(auth.uid(), new.teacher_id);
  else
    new.teacher_id := old.teacher_id;
  end if;
  return new;
end;
$$;

-- Validates a surah:ayah range that may span surahs. All four columns null is allowed only for
-- rows migrated from free-text surah names that didn't match (spec §7).
create or replace function private.validate_quran_range()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_from_max int;
  v_to_max int;
begin
  if new.from_surah_no is null and new.from_ayah is null and new.to_surah_no is null and new.to_ayah is null then
    if tg_op = 'INSERT' and coalesce(current_setting('app.migrating', true), '') <> 'on' then
      raise exception 'حدّد بداية المقطع ونهايته';
    end if;
    return new;
  end if;
  if new.from_surah_no is null or new.from_ayah is null or new.to_surah_no is null or new.to_ayah is null then
    raise exception 'حدّد بداية المقطع ونهايته';
  end if;
  select ayah_count into v_from_max from public.quran_surahs where surah_no = new.from_surah_no;
  select ayah_count into v_to_max from public.quran_surahs where surah_no = new.to_surah_no;
  if v_from_max is null or v_to_max is null then
    raise exception 'رقم السورة غير صحيح';
  end if;
  if new.from_ayah < 1 or new.from_ayah > v_from_max or new.to_ayah < 1 or new.to_ayah > v_to_max then
    raise exception 'رقم الآية خارج حدود السورة';
  end if;
  if (new.from_surah_no, new.from_ayah) > (new.to_surah_no, new.to_ayah) then
    raise exception 'بداية المقطع بعد نهايته';
  end if;
  return new;
end;
$$;

------------------------------------------------------------------------------------------
-- Halaqat (circles): a free-text, unique name; teacher_id goes away (spec §4.1)
------------------------------------------------------------------------------------------

drop policy if exists circles_select on public.circles;
drop index if exists public.idx_circles_teacher;
alter table public.circles drop column teacher_id;

alter table public.circles
  add column active boolean not null default true,
  add column updated_at timestamptz not null default now(),
  add column updated_by uuid,
  add column edited_at timestamptz not null default now();

create unique index circles_name_unique on public.circles (lower(btrim(name)));
create index idx_circles_updated_at on public.circles (updated_at);

create trigger trg_circles_sync before insert or update on public.circles
  for each row execute function private.sync_touch();

create policy circles_select on public.circles for select to authenticated using (private.is_staff());
-- circles_insert / circles_update (admin only) are kept as they are.

------------------------------------------------------------------------------------------
-- Students: active flag, no cached position columns (spec §4.2)
------------------------------------------------------------------------------------------

drop trigger if exists trg_daily_side_effects on public.daily_records;
drop function if exists private.apply_daily_side_effects();
drop function if exists public.list_students(uuid, text);

drop index if exists public.idx_students_current_surah;
alter table public.students
  drop column current_surah_no,
  drop column current_surah,
  drop column current_from_ayah,
  drop column current_to_ayah,
  drop column current_grade;

alter table public.students
  add column active boolean not null default true,
  add column updated_at timestamptz not null default now(),
  add column updated_by uuid,
  add column edited_at timestamptz not null default now();

create index idx_students_updated_at on public.students (updated_at);

-- Teachers may add and edit students (including moving halaqa); only the admin archives.
create or replace function private.guard_student_archive()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' and not new.active) or (tg_op = 'UPDATE' and new.active is distinct from old.active) then
    if not private.is_admin() then
      raise exception 'أرشفة الطلاب متاحة للمدير فقط';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_students_guard before insert or update on public.students
  for each row execute function private.guard_student_archive();
create trigger trg_students_sync before insert or update on public.students
  for each row execute function private.sync_touch();

drop policy if exists students_select on public.students;
drop policy if exists students_insert on public.students;
drop policy if exists students_update on public.students;
create policy students_select on public.students for select to authenticated using (private.is_staff());
create policy students_insert on public.students for insert to authenticated with check (private.is_staff());
create policy students_update on public.students for update to authenticated
  using (private.is_staff()) with check (private.is_staff());

------------------------------------------------------------------------------------------
-- Talqeen sessions (spec §4.7)
------------------------------------------------------------------------------------------

create table public.talqeen_sessions (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles (id) on delete cascade,
  session_date date not null default current_date,
  from_surah_no int not null references public.quran_surahs (surah_no),
  from_ayah int not null,
  to_surah_no int not null references public.quran_surahs (surah_no),
  to_ayah int not null,
  notes text,
  teacher_id uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  edited_at timestamptz not null default now(),
  deleted_at timestamptz
);

------------------------------------------------------------------------------------------
-- Quran tracks: one row = one piece of Quran work (spec §4.3)
------------------------------------------------------------------------------------------

create table public.quran_entries (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  entry_date date not null default current_date,
  track text not null check (track in ('HIFZ', 'TILAWA', 'MURAJAA', 'TALQEEN')),
  from_surah_no int references public.quran_surahs (surah_no),
  from_ayah int,
  to_surah_no int references public.quran_surahs (surah_no),
  to_ayah int,
  quality text,
  notes text,
  talqeen_session_id uuid references public.talqeen_sessions (id) on delete cascade,
  teacher_id uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  edited_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (track = 'TALQEEN' or talqeen_session_id is null)
);

------------------------------------------------------------------------------------------
-- Attendance: one row per student per day (spec §4.6)
------------------------------------------------------------------------------------------

create table public.attendance (
  student_id uuid not null references public.students (id) on delete cascade,
  att_date date not null,
  status text not null check (status in ('PRESENT', 'LATE', 'EXCUSED', 'ABSENT')),
  teacher_id uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  edited_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (student_id, att_date)
);

------------------------------------------------------------------------------------------
-- Arabic track, page-based (spec §4.4)
------------------------------------------------------------------------------------------

create table public.arabic_books (
  id uuid primary key default gen_random_uuid(),
  title text not null check (btrim(title) <> ''),
  total_pages int not null check (total_pages > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  edited_at timestamptz not null default now()
);
create unique index arabic_books_title_unique on public.arabic_books (lower(btrim(title)));

create table public.student_arabic_enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  book_id uuid not null references public.arabic_books (id) on delete cascade,
  started_on date not null default current_date,
  finished_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  edited_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (student_id, book_id)
);

create table public.arabic_entries (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  entry_date date not null default current_date,
  book_id uuid not null references public.arabic_books (id) on delete cascade,
  from_page int not null check (from_page >= 1),
  to_page int not null,
  quality text,
  notes text,
  teacher_id uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  edited_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (to_page >= from_page)
);

create or replace function private.validate_arabic_pages()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_total int;
begin
  select total_pages into v_total from public.arabic_books where id = new.book_id;
  if v_total is null then
    raise exception 'الكتاب غير موجود';
  end if;
  if new.from_page < 1 or new.to_page < new.from_page or new.to_page > v_total then
    raise exception 'رقم الصفحة خارج حدود الكتاب (% صفحة)', v_total;
  end if;
  return new;
end;
$$;

------------------------------------------------------------------------------------------
-- Tarbiya: keep edu_notes, add audit/sync columns (spec §4.5). points stays, hidden in the UI.
------------------------------------------------------------------------------------------

alter table public.edu_notes
  alter column points set default 0,
  add column updated_at timestamptz not null default now(),
  add column updated_by uuid,
  add column edited_at timestamptz not null default now(),
  add column deleted_at timestamptz;

------------------------------------------------------------------------------------------
-- Triggers, indexes and RLS for every staff-editable table
------------------------------------------------------------------------------------------

create trigger trg_talqeen_validate before insert or update on public.talqeen_sessions
  for each row execute function private.validate_quran_range();
create trigger trg_quran_validate before insert or update on public.quran_entries
  for each row execute function private.validate_quran_range();
create trigger trg_arabic_validate before insert or update on public.arabic_entries
  for each row execute function private.validate_arabic_pages();

do $$
declare
  t text;
begin
  -- Tables whose rows remember who created them.
  foreach t in array array['talqeen_sessions', 'quran_entries', 'attendance', 'arabic_entries', 'edu_notes'] loop
    execute format('create trigger trg_%1$s_creator before insert or update on public.%1$I
                    for each row execute function private.set_creator()', t);
  end loop;

  foreach t in array array['talqeen_sessions', 'quran_entries', 'attendance', 'arabic_books',
                           'student_arabic_enrollments', 'arabic_entries', 'edu_notes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create trigger trg_%1$s_sync before insert or update on public.%1$I
                    for each row execute function private.sync_touch()', t);
    execute format('create index idx_%1$s_updated_at on public.%1$I (updated_at)', t);
  end loop;

  -- Every active teacher reads and writes these. No DELETE policy: deletes are soft.
  foreach t in array array['talqeen_sessions', 'quran_entries', 'attendance',
                           'student_arabic_enrollments', 'arabic_entries', 'edu_notes'] loop
    execute format('drop policy if exists %1$s_select on public.%1$I', t);
    execute format('create policy %1$s_select on public.%1$I for select to authenticated using (private.is_staff())', t);
    execute format('create policy %1$s_insert on public.%1$I for insert to authenticated with check (private.is_staff())', t);
    execute format('create policy %1$s_update on public.%1$I for update to authenticated
                    using (private.is_staff()) with check (private.is_staff())', t);
  end loop;
end;
$$;

-- edu_notes had its own policy names; the loop above added the new ones.
drop policy if exists edu_select on public.edu_notes;
drop policy if exists edu_insert on public.edu_notes;

create policy arabic_books_select on public.arabic_books for select to authenticated using (private.is_staff());
create policy arabic_books_insert on public.arabic_books for insert to authenticated with check (private.is_admin());
create policy arabic_books_update on public.arabic_books for update to authenticated
  using (private.is_admin()) with check (private.is_admin());

create index idx_quran_entries_student_date on public.quran_entries (student_id, entry_date);
create index idx_quran_entries_date on public.quran_entries (entry_date);
create index idx_quran_entries_session on public.quran_entries (talqeen_session_id);
create index idx_quran_entries_teacher on public.quran_entries (teacher_id);
create index idx_quran_entries_from_surah on public.quran_entries (from_surah_no);
create index idx_quran_entries_to_surah on public.quran_entries (to_surah_no);
create index idx_talqeen_circle_date on public.talqeen_sessions (circle_id, session_date);
create index idx_talqeen_teacher on public.talqeen_sessions (teacher_id);
create index idx_talqeen_from_surah on public.talqeen_sessions (from_surah_no);
create index idx_talqeen_to_surah on public.talqeen_sessions (to_surah_no);
create index idx_attendance_date on public.attendance (att_date);
create index idx_attendance_teacher on public.attendance (teacher_id);
create index idx_enrollments_book on public.student_arabic_enrollments (book_id);
create index idx_arabic_entries_student_date on public.arabic_entries (student_id, entry_date);
create index idx_arabic_entries_book on public.arabic_entries (book_id);
create index idx_arabic_entries_teacher on public.arabic_entries (teacher_id);

------------------------------------------------------------------------------------------
-- Data migration from daily_records / tilawah_records (spec §7)
------------------------------------------------------------------------------------------

do $$
declare
  v_unmatched int;
begin
  perform set_config('app.migrating', 'on', true);

  insert into public.quran_entries
    (id, student_id, entry_date, track, from_surah_no, from_ayah, to_surah_no, to_ayah,
     quality, notes, teacher_id, created_at, edited_at)
  select d.id, d.student_id, d.record_date,
         case d.work_type when 'NEW_MEMORIZATION' then 'HIFZ' when 'REVIEW' then 'MURAJAA' else 'TILAWA' end,
         case when ok then s.surah_no end, case when ok then d.from_ayah end,
         case when ok then s.surah_no end, case when ok then d.to_ayah end,
         d.grade, d.notes, d.teacher_id, d.created_at, d.created_at
  from public.daily_records d
  left join public.quran_surahs s on s.name = btrim(regexp_replace(coalesce(d.surah, ''), '^سورة\s+', ''))
  cross join lateral (
    select s.surah_no is not null and d.from_ayah between 1 and s.ayah_count
           and d.to_ayah between d.from_ayah and s.ayah_count as ok
  ) v;

  select count(*) into v_unmatched from public.quran_entries where from_surah_no is null;
  if v_unmatched > 0 then
    raise notice 'daily_records migrated without a position (surah name or ayahs did not match): %', v_unmatched;
  end if;

  insert into public.quran_entries
    (id, student_id, entry_date, track, from_surah_no, from_ayah, to_surah_no, to_ayah,
     quality, notes, teacher_id, created_at, edited_at)
  select t.id, t.student_id, t.record_date, 'TILAWA', t.surah_no, t.from_ayah, t.surah_no, t.to_ayah,
         t.grade, t.notes, t.teacher_id, t.created_at, t.created_at
  from public.tilawah_records t;

  -- Latest row per student per day wins.
  insert into public.attendance (student_id, att_date, status, teacher_id, created_at, edited_at)
  select distinct on (d.student_id, d.record_date)
         d.student_id, d.record_date,
         case d.attendance when 'ABSENT_EXCUSED' then 'EXCUSED' else d.attendance end,
         d.teacher_id, d.created_at, d.created_at
  from public.daily_records d
  order by d.student_id, d.record_date, d.created_at desc;
end;
$$;

-- Archive the old tables read-only (admin can still read them; nothing writes them).
alter table public.daily_records rename to deprecated_v1_daily_records;
alter table public.tilawah_records rename to deprecated_v1_tilawah_records;

drop policy if exists daily_insert on public.deprecated_v1_daily_records;
drop policy if exists daily_select on public.deprecated_v1_daily_records;
drop policy if exists tilawah_insert on public.deprecated_v1_tilawah_records;
drop policy if exists tilawah_select on public.deprecated_v1_tilawah_records;
create policy deprecated_v1_daily_select on public.deprecated_v1_daily_records
  for select to authenticated using (private.is_admin());
create policy deprecated_v1_tilawah_select on public.deprecated_v1_tilawah_records
  for select to authenticated using (private.is_admin());

-- Grading is out of scope for now (spec §10); the monthly score reads the archived tables.
drop function if exists public.get_student_score(uuid, text);
drop function if exists private.is_active_teacher();
