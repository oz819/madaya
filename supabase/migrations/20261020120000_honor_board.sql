-- لوحة الشرف العامة: a public page (/honor) with the week's top students per section (first name
-- and the family name's initial only) and new juz' certificates. Off until the admin turns it on.
-- The page is built on the server; no new function is exposed to the public.
-- Additive only: a column with a default on the settings row.

alter table public.ranking_settings add column honor_enabled boolean not null default false;
