-- Restores/soft deletes from the admin RPCs must always count as the newest edit. sync_touch drops
-- an update whose edited_at is older than the row's, and a device clock running ahead can leave a
-- row with edited_at in the "future" — so bump past it instead of using now() alone.
create or replace function private.next_edit(p_prev timestamptz)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select greatest(now(), p_prev + interval '1 millisecond');
$$;
revoke all on function private.next_edit(timestamptz) from public;
grant execute on function private.next_edit(timestamptz) to authenticated, service_role;

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
    update public.students set deleted_at = now(), edited_at = private.next_edit(edited_at) where id = p_id and deleted_at is null;
  elsif p_kind = 'circle' then
    if exists (select 1 from public.students where circle_id = p_id and deleted_at is null) then
      raise exception 'في هذه الحلقة طلاب. انقلهم إلى حلقة أخرى أو احذفهم أولًا';
    end if;
    update public.circles set deleted_at = now(), edited_at = private.next_edit(edited_at) where id = p_id and deleted_at is null;
  elsif p_kind = 'arabic_book' then
    if exists (select 1 from public.student_arabic_enrollments
               where book_id = p_id and deleted_at is null and finished_on is null) then
      raise exception 'هذا الكتاب يدرسه طلاب حاليًا. أنهِ تسجيلهم فيه أولًا';
    end if;
    update public.arabic_books set deleted_at = now(), edited_at = private.next_edit(edited_at) where id = p_id and deleted_at is null;
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
    update public.students set deleted_at = null, edited_at = private.next_edit(edited_at) where id = p_id;
  elsif p_kind = 'circle' then
    update public.circles set deleted_at = null, edited_at = private.next_edit(edited_at) where id = p_id;
  elsif p_kind = 'arabic_book' then
    update public.arabic_books set deleted_at = null, edited_at = private.next_edit(edited_at) where id = p_id;
  elsif p_kind = 'quran_entry' then
    update public.quran_entries set deleted_at = null, edited_at = private.next_edit(edited_at) where id = p_id;
  elsif p_kind = 'arabic_entry' then
    update public.arabic_entries set deleted_at = null, edited_at = private.next_edit(edited_at) where id = p_id;
  elsif p_kind = 'edu_note' then
    update public.edu_notes set deleted_at = null, edited_at = private.next_edit(edited_at) where id = p_id;
  elsif p_kind = 'talqeen_session' then
    -- Bring back the entries that were removed together with the session (same edited_at).
    select edited_at into v_edited from public.talqeen_sessions where id = p_id;
    update public.talqeen_sessions set deleted_at = null, edited_at = private.next_edit(edited_at) where id = p_id;
    update public.quran_entries set deleted_at = null, edited_at = private.next_edit(edited_at)
    where talqeen_session_id = p_id and deleted_at is not null and edited_at = v_edited;
  else
    raise exception 'نوع غير معروف';
  end if;
end;
$$;
