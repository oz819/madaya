-- تسجيل الطلاب الجدد: a public form (/register, no login) sends a request; the admin accepts it into
-- a halaqa (that creates the student with the guardian's number) or rejects it.
-- The form only reaches the database through submit_registration(), which checks lengths, drops
-- what a bot filled into the hidden field, and limits floods. Nobody else can read the requests.
-- Additive only: a new table and new functions.

create table public.registration_requests (
  id uuid primary key default gen_random_uuid(),
  student_name text not null check (char_length(btrim(student_name)) between 2 and 100),
  age smallint check (age between 3 and 80),
  section text not null check (section in ('MALE', 'FEMALE')),
  guardian_name text check (char_length(guardian_name) <= 100),
  -- International format, digits only, like students.guardian_phone.
  guardian_phone text not null check (guardian_phone ~ '^[0-9]{7,15}$'),
  memorized text check (char_length(memorized) <= 300),
  status text not null default 'PENDING' check (status in ('PENDING', 'ACCEPTED', 'REJECTED')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles (id) on delete set null,
  student_id uuid references public.students (id) on delete set null
);

create index idx_registration_requests_status on public.registration_requests (status, created_at desc);
create index idx_registration_requests_phone on public.registration_requests (guardian_phone, created_at desc);

-- Only the admin reads them. Writes go through the functions below.
alter table public.registration_requests enable row level security;
create policy registration_requests_select on public.registration_requests for select to authenticated using (private.is_admin());

-- The public form. Returns true when the request was received (also for a bot caught by the
-- hidden field, so it learns nothing). Raises a readable Arabic message otherwise.
create or replace function public.submit_registration(
  p_student_name text,
  p_age integer,
  p_section text,
  p_guardian_name text,
  p_guardian_phone text,
  p_memorized text,
  p_trap text default null
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_student_name, ''));
begin
  if coalesce(p_trap, '') <> '' then
    return true;
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 100 then
    raise exception 'اكتبوا اسم الطالب (من حرفين إلى 100 حرف)';
  end if;
  if p_age is not null and (p_age < 3 or p_age > 80) then
    raise exception 'العمر غير صحيح';
  end if;
  if p_section is null or p_section not in ('MALE', 'FEMALE') then
    raise exception 'اختاروا القسم';
  end if;
  if coalesce(p_guardian_phone, '') !~ '^[0-9]{7,15}$' then
    raise exception 'رقم ولي الأمر غير صحيح';
  end if;
  if char_length(coalesce(p_guardian_name, '')) > 100 or char_length(coalesce(p_memorized, '')) > 300 then
    raise exception 'النص طويل جدًا';
  end if;
  -- Floods: a few requests per number a day, and a cap on all requests in an hour.
  if (select count(*) from public.registration_requests
      where guardian_phone = p_guardian_phone and created_at > now() - interval '1 day') >= 5 then
    raise exception 'وصلتنا طلبات كثيرة من هذا الرقم اليوم. سنتواصل معكم قريبًا إن شاء الله';
  end if;
  if (select count(*) from public.registration_requests where created_at > now() - interval '1 hour') >= 60 then
    raise exception 'الخدمة مشغولة الآن، حاولوا بعد قليل';
  end if;

  insert into public.registration_requests (student_name, age, section, guardian_name, guardian_phone, memorized)
  values (v_name, p_age, p_section, nullif(btrim(p_guardian_name), ''), p_guardian_phone, nullif(btrim(p_memorized), ''));
  return true;
end;
$$;
revoke all on function public.submit_registration(text, integer, text, text, text, text, text) from public;
grant execute on function public.submit_registration(text, integer, text, text, text, text, text) to anon, authenticated;

-- Admin: accept into a halaqa. Creates the student (with the guardian's name and number; the
-- family link comes from the students trigger) and returns the new student's id.
create or replace function public.admin_accept_registration(p_id uuid, p_circle_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_req public.registration_requests;
  v_student uuid;
begin
  if not private.is_admin() then
    raise exception 'قبول طلبات التسجيل متاح للمدير فقط';
  end if;
  select * into v_req from public.registration_requests where id = p_id for update;
  if v_req.id is null then
    raise exception 'الطلب غير موجود';
  end if;
  if v_req.status <> 'PENDING' then
    raise exception 'تمّ البتّ في هذا الطلب من قبل';
  end if;
  if not exists (select 1 from public.circles where id = p_circle_id and active and deleted_at is null) then
    raise exception 'اختر حلقة';
  end if;

  insert into public.students (name, circle_id, guardian_name, guardian_phone)
  values (v_req.student_name, p_circle_id, v_req.guardian_name, v_req.guardian_phone)
  returning id into v_student;

  update public.registration_requests
  set status = 'ACCEPTED', decided_at = now(), decided_by = auth.uid(), student_id = v_student
  where id = p_id;
  return v_student;
end;
$$;
revoke all on function public.admin_accept_registration(uuid, uuid) from public, anon;
grant execute on function public.admin_accept_registration(uuid, uuid) to authenticated;

create or replace function public.admin_reject_registration(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'رفض طلبات التسجيل متاح للمدير فقط';
  end if;
  update public.registration_requests
  set status = 'REJECTED', decided_at = now(), decided_by = auth.uid()
  where id = p_id and status = 'PENDING';
  if not found then
    raise exception 'تمّ البتّ في هذا الطلب من قبل';
  end if;
end;
$$;
revoke all on function public.admin_reject_registration(uuid) from public, anon;
grant execute on function public.admin_reject_registration(uuid) to authenticated;
