-- Soft delete everywhere + an admin "trash" (سجل المحذوفات).
--   * profiles / students / circles / arabic_books gain deleted_at + deleted_by; the four entry
--     tables (already soft-deleted via deleted_at) gain deleted_by.
--   * deleted_by is stamped by a trigger from auth.uid(), never trusted from the client.
--   * A deleted staff account fails is_staff()/is_admin() and is banned in auth, so it can't sign in.
--   * Admin-only RPCs list the trash, restore an item, or purge it for good.
--   * Purging a teacher keeps their records and clears the "recorded by" link (teacher_id -> null).
-- Additive: the currently deployed app ignores the new columns and keeps working unchanged.

-- ---------- columns ----------
alter table public.profiles     add column deleted_at timestamptz, add column deleted_by uuid;
alter table public.students     add column deleted_at timestamptz, add column deleted_by uuid;
alter table public.circles      add column deleted_at timestamptz, add column deleted_by uuid;
alter table public.arabic_books add column deleted_at timestamptz, add column deleted_by uuid;
alter table public.quran_entries    add column deleted_by uuid;
alter table public.arabic_entries   add column deleted_by uuid;
alter table public.edu_notes        add column deleted_by uuid;
alter table public.talqeen_sessions add column deleted_by uuid;

-- ---------- deleted_by stamp ----------
create or replace function private.stamp_deleted_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.deleted_at is null then
    new.deleted_by := null;
  elsif tg_op = 'INSERT' or old.deleted_at is null then
    new.deleted_by := coalesce(auth.uid(), new.deleted_by);
  else
    new.deleted_by := old.deleted_by;
  end if;
  return new;
end;
$$;

create trigger trg_profiles_deleted_by         before insert or update on public.profiles         for each row execute function private.stamp_deleted_by();
create trigger trg_students_deleted_by         before insert or update on public.students         for each row execute function private.stamp_deleted_by();
create trigger trg_circles_deleted_by          before insert or update on public.circles          for each row execute function private.stamp_deleted_by();
create trigger trg_arabic_books_deleted_by     before insert or update on public.arabic_books     for each row execute function private.stamp_deleted_by();
create trigger trg_quran_entries_deleted_by    before insert or update on public.quran_entries    for each row execute function private.stamp_deleted_by();
create trigger trg_arabic_entries_deleted_by   before insert or update on public.arabic_entries   for each row execute function private.stamp_deleted_by();
create trigger trg_edu_notes_deleted_by        before insert or update on public.edu_notes        for each row execute function private.stamp_deleted_by();
create trigger trg_talqeen_sessions_deleted_by before insert or update on public.talqeen_sessions for each row execute function private.stamp_deleted_by();

-- ---------- access: a deleted account is not staff ----------
create or replace function private.is_staff()
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select exists(select 1 from profiles where id = auth.uid() and role in ('ADMIN', 'TEACHER') and active and deleted_at is null);
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select exists(select 1 from profiles where id = auth.uid() and role = 'ADMIN' and active and deleted_at is null);
$$;

-- Teachers may edit students but only an admin archives or deletes one.
create or replace function private.guard_student_archive()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' and (not new.active or new.deleted_at is not null))
     or (tg_op = 'UPDATE' and (new.active is distinct from old.active or new.deleted_at is distinct from old.deleted_at)) then
    if not private.is_admin() then
      raise exception 'أرشفة الطلاب وحذفهم متاحان للمدير فقط';
    end if;
  end if;
  return new;
end;
$$;

-- ---------- purging a teacher keeps their records ----------
-- teacher_id stays pinned on update, except that it may become null once its profile is gone
-- (that is what ON DELETE SET NULL does when an admin purges an account).
create or replace function private.set_creator()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.teacher_id := coalesce(auth.uid(), new.teacher_id);
  elsif new.teacher_id is null and old.teacher_id is not null
        and not exists (select 1 from public.profiles where id = old.teacher_id) then
    null; -- the account was purged: keep the record, drop the link
  else
    new.teacher_id := old.teacher_id;
  end if;
  return new;
end;
$$;

alter table public.edu_notes alter column teacher_id drop not null;

alter table public.quran_entries    drop constraint quran_entries_teacher_id_fkey,
  add constraint quran_entries_teacher_id_fkey foreign key (teacher_id) references public.profiles(id) on delete set null;
alter table public.attendance       drop constraint attendance_teacher_id_fkey,
  add constraint attendance_teacher_id_fkey foreign key (teacher_id) references public.profiles(id) on delete set null;
alter table public.arabic_entries   drop constraint arabic_entries_teacher_id_fkey,
  add constraint arabic_entries_teacher_id_fkey foreign key (teacher_id) references public.profiles(id) on delete set null;
alter table public.edu_notes        drop constraint edu_notes_teacher_id_fkey1,
  add constraint edu_notes_teacher_id_fkey1 foreign key (teacher_id) references public.profiles(id) on delete set null;
alter table public.talqeen_sessions drop constraint talqeen_sessions_teacher_id_fkey,
  add constraint talqeen_sessions_teacher_id_fkey foreign key (teacher_id) references public.profiles(id) on delete set null;

-- ---------- admin RPCs ----------
-- One place that knows how to name each kind of item, used by the trash list.
create or replace function public.admin_trash()
returns table (kind text, id text, label text, detail text, deleted_at timestamptz, deleted_by_name text)
language plpgsql
stable security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'هذا الإجراء متاح للمدير فقط';
  end if;
  return query
    select 'profile', p.id::text, p.name, case p.role when 'ADMIN' then 'مدير' else 'محفّظ' end, p.deleted_at, d.name
    from public.profiles p left join public.profiles d on d.id = p.deleted_by
    where p.deleted_at is not null
  union all
    select 'student', s.id::text, s.name, coalesce('حلقة ' || c.name, ''), s.deleted_at, d.name
    from public.students s left join public.circles c on c.id = s.circle_id left join public.profiles d on d.id = s.deleted_by
    where s.deleted_at is not null
  union all
    select 'circle', c.id::text, c.name, '', c.deleted_at, d.name
    from public.circles c left join public.profiles d on d.id = c.deleted_by
    where c.deleted_at is not null
  union all
    select 'arabic_book', b.id::text, b.title, b.total_pages || ' صفحة', b.deleted_at, d.name
    from public.arabic_books b left join public.profiles d on d.id = b.deleted_by
    where b.deleted_at is not null
  union all
    -- talqeen entries are removed together with their session, so they are listed through it
    select 'quran_entry', q.id::text,
           (case q.track when 'HIFZ' then 'حفظ' when 'TILAWA' then 'تلاوة' when 'MURAJAA' then 'مراجعة' else 'تلقين' end)
             || ' — ' || s.name,
           q.entry_date::text || coalesce(' · ' || fs.name || ' ' || q.from_ayah || ' ← ' || ts.name || ' ' || q.to_ayah, ''),
           q.deleted_at, d.name
    from public.quran_entries q
    join public.students s on s.id = q.student_id
    left join public.quran_surahs fs on fs.surah_no = q.from_surah_no
    left join public.quran_surahs ts on ts.surah_no = q.to_surah_no
    left join public.profiles d on d.id = q.deleted_by
    where q.deleted_at is not null and q.talqeen_session_id is null
  union all
    select 'arabic_entry', a.id::text, 'عربية — ' || s.name,
           a.entry_date::text || ' · ' || b.title || ' ص' || a.from_page || '-' || a.to_page, a.deleted_at, d.name
    from public.arabic_entries a
    join public.students s on s.id = a.student_id
    join public.arabic_books b on b.id = a.book_id
    left join public.profiles d on d.id = a.deleted_by
    where a.deleted_at is not null
  union all
    select 'edu_note', n.id::text, 'ملاحظة تربوية — ' || s.name, n.record_date::text || ' · ' || n.area, n.deleted_at, d.name
    from public.edu_notes n
    join public.students s on s.id = n.student_id
    left join public.profiles d on d.id = n.deleted_by
    where n.deleted_at is not null
  union all
    select 'talqeen_session', t.id::text, 'جلسة تلقين — ' || c.name,
           t.session_date::text || ' · ' || fs.name || ' ' || t.from_ayah || ' ← ' || ts.name || ' ' || t.to_ayah,
           t.deleted_at, d.name
    from public.talqeen_sessions t
    join public.circles c on c.id = t.circle_id
    left join public.quran_surahs fs on fs.surah_no = t.from_surah_no
    left join public.quran_surahs ts on ts.surah_no = t.to_surah_no
    left join public.profiles d on d.id = t.deleted_by
    where t.deleted_at is not null
  order by 5 desc;
end;
$$;

-- Soft-deletes one admin-managed item (accounts, students, circles, books). Entries are still
-- soft-deleted by teachers through the normal offline outbox.
create or replace function public.admin_soft_delete(p_kind text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'هذا الإجراء متاح للمدير فقط';
  end if;

  if p_kind = 'profile' then
    if p_id = auth.uid() then
      raise exception 'لا يمكنك حذف حسابك أنت';
    end if;
    update public.profiles set deleted_at = now() where id = p_id and deleted_at is null;
    -- Block sign-in and end every open session right away.
    update auth.users set banned_until = 'infinity' where id = p_id;
    delete from auth.sessions where user_id = p_id;
  elsif p_kind = 'student' then
    update public.students set deleted_at = now(), edited_at = now() where id = p_id and deleted_at is null;
  elsif p_kind = 'circle' then
    if exists (select 1 from public.students where circle_id = p_id and deleted_at is null) then
      raise exception 'في هذه الحلقة طلاب. انقلهم إلى حلقة أخرى أو احذفهم أولًا';
    end if;
    update public.circles set deleted_at = now(), edited_at = now() where id = p_id and deleted_at is null;
  elsif p_kind = 'arabic_book' then
    if exists (select 1 from public.student_arabic_enrollments
               where book_id = p_id and deleted_at is null and finished_on is null) then
      raise exception 'هذا الكتاب يدرسه طلاب حاليًا. أنهِ تسجيلهم فيه أولًا';
    end if;
    update public.arabic_books set deleted_at = now(), edited_at = now() where id = p_id and deleted_at is null;
  else
    raise exception 'نوع غير معروف';
  end if;
end;
$$;

create or replace function public.admin_restore(p_kind text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_edited timestamptz;
begin
  if not private.is_admin() then
    raise exception 'هذا الإجراء متاح للمدير فقط';
  end if;

  if p_kind = 'profile' then
    update public.profiles set deleted_at = null where id = p_id;
    update auth.users set banned_until = null where id = p_id;
  elsif p_kind = 'student' then
    if exists (select 1 from public.students s join public.circles c on c.id = s.circle_id
               where s.id = p_id and c.deleted_at is not null) then
      raise exception 'حلقة هذا الطالب محذوفة. استرجع الحلقة أولًا';
    end if;
    update public.students set deleted_at = null, edited_at = now() where id = p_id;
  elsif p_kind = 'circle' then
    update public.circles set deleted_at = null, edited_at = now() where id = p_id;
  elsif p_kind = 'arabic_book' then
    update public.arabic_books set deleted_at = null, edited_at = now() where id = p_id;
  elsif p_kind = 'quran_entry' then
    update public.quran_entries set deleted_at = null, edited_at = now() where id = p_id;
  elsif p_kind = 'arabic_entry' then
    update public.arabic_entries set deleted_at = null, edited_at = now() where id = p_id;
  elsif p_kind = 'edu_note' then
    update public.edu_notes set deleted_at = null, edited_at = now() where id = p_id;
  elsif p_kind = 'talqeen_session' then
    -- Bring back the entries that were removed together with the session (same edited_at).
    select edited_at into v_edited from public.talqeen_sessions where id = p_id;
    update public.talqeen_sessions set deleted_at = null, edited_at = now() where id = p_id;
    update public.quran_entries set deleted_at = null, edited_at = now()
    where talqeen_session_id = p_id and deleted_at is not null and edited_at = v_edited;
  else
    raise exception 'نوع غير معروف';
  end if;
end;
$$;

-- Permanent removal, only for something already in the trash.
create or replace function public.admin_purge(p_kind text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'هذا الإجراء متاح للمدير فقط';
  end if;

  if p_kind = 'profile' then
    if p_id = auth.uid() then
      raise exception 'لا يمكنك حذف حسابك أنت';
    end if;
    if not exists (select 1 from public.profiles where id = p_id and deleted_at is not null) then
      raise exception 'العنصر ليس في سجل المحذوفات';
    end if;
    -- Cascades to profiles; records keep existing with teacher_id set to null.
    delete from auth.users where id = p_id;
  elsif p_kind = 'student' then
    -- Cascades to all of this student's records.
    delete from public.students where id = p_id and deleted_at is not null;
  elsif p_kind = 'circle' then
    if exists (select 1 from public.students where circle_id = p_id) then
      raise exception 'لهذه الحلقة طلاب (ولو في سجل المحذوفات). امسحهم نهائيًا أو انقلهم أولًا';
    end if;
    delete from public.circles where id = p_id and deleted_at is not null;
  elsif p_kind = 'arabic_book' then
    if exists (select 1 from public.arabic_entries where book_id = p_id)
       or exists (select 1 from public.student_arabic_enrollments where book_id = p_id) then
      raise exception 'لهذا الكتاب سجلات دروس عند الطلاب، فلا يمكن مسحه نهائيًا';
    end if;
    delete from public.arabic_books where id = p_id and deleted_at is not null;
  elsif p_kind = 'quran_entry' then
    delete from public.quran_entries where id = p_id and deleted_at is not null;
  elsif p_kind = 'arabic_entry' then
    delete from public.arabic_entries where id = p_id and deleted_at is not null;
  elsif p_kind = 'edu_note' then
    delete from public.edu_notes where id = p_id and deleted_at is not null;
  elsif p_kind = 'talqeen_session' then
    delete from public.talqeen_sessions where id = p_id and deleted_at is not null;
  else
    raise exception 'نوع غير معروف';
  end if;
end;
$$;

revoke all on function public.admin_trash() from public, anon;
revoke all on function public.admin_soft_delete(text, uuid) from public, anon;
revoke all on function public.admin_restore(text, uuid) from public, anon;
revoke all on function public.admin_purge(text, uuid) from public, anon;
grant execute on function public.admin_trash() to authenticated;
grant execute on function public.admin_soft_delete(text, uuid) to authenticated;
grant execute on function public.admin_restore(text, uuid) to authenticated;
grant execute on function public.admin_purge(text, uuid) to authenticated;
revoke all on function private.stamp_deleted_by() from public;
