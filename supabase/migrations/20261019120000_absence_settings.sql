-- تنبيه الغياب: after how many absences in a row a student is flagged, and the admin's own wording
-- of the gentle message to the family (null: the app's default text).
-- Additive only: new columns with defaults on the settings row.

alter table public.ranking_settings
  add column absence_threshold smallint not null default 3 check (absence_threshold between 1 and 30),
  add column absence_message text check (char_length(absence_message) <= 1000);
