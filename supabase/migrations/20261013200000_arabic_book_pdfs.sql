-- Arabic books can carry one PDF each, stored in a private bucket.
--   * Every staff member can open the PDF (signed link, valid for one hour).
--   * Only admins upload, replace or remove a PDF, same as adding books.
--   * Limit: 50 MB per file, PDF only (Supabase free plan's per-file cap).

alter table public.arabic_books add column if not exists pdf_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('arabic-books', 'arabic-books', false, 52428800, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists arabic_book_pdf_select on storage.objects;
drop policy if exists arabic_book_pdf_insert on storage.objects;
drop policy if exists arabic_book_pdf_update on storage.objects;
drop policy if exists arabic_book_pdf_delete on storage.objects;

create policy arabic_book_pdf_select on storage.objects for select to authenticated
  using (bucket_id = 'arabic-books' and private.is_staff());
create policy arabic_book_pdf_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'arabic-books' and private.is_admin());
create policy arabic_book_pdf_update on storage.objects for update to authenticated
  using (bucket_id = 'arabic-books' and private.is_admin())
  with check (bucket_id = 'arabic-books' and private.is_admin());
create policy arabic_book_pdf_delete on storage.objects for delete to authenticated
  using (bucket_id = 'arabic-books' and private.is_admin());
