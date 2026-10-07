// Derived "current position" per student (spec §4.8), computed from the local copy so it works
// offline. Mirrors the student_progress view on the server.

import type { ArabicBook, ArabicEnrollment, ArabicEntry, Attendance, EduNote, QuranEntry, QuranTrack } from "@/lib/types";
import { entryRange, type Mushaf, type QuranRange } from "@/lib/quran";

export function byNewest<T extends { created_at: string; edited_at?: string }>(dateOf: (r: T) => string) {
  return (a: T, b: T) => dateOf(b).localeCompare(dateOf(a)) || b.created_at.localeCompare(a.created_at);
}

export function latestOfTrack(entries: QuranEntry[] | undefined, track: QuranTrack): QuranEntry | undefined {
  let best: QuranEntry | undefined;
  for (const e of entries ?? []) {
    if (e.track !== track || e.deleted_at) continue;
    if (!best || e.entry_date > best.entry_date || (e.entry_date === best.entry_date && e.created_at > best.created_at)) best = e;
  }
  return best;
}

export type TrackPosition = {
  entry: QuranEntry;
  range: QuranRange | null;
  percent: number | null;
};

export type StudentProgress = {
  hifz?: TrackPosition & { memorizedAyahs: number };
  tilawa?: TrackPosition;
  murajaa?: TrackPosition;
  talqeen?: TrackPosition;
  arabic?: { book: ArabicBook; entry?: ArabicEntry; page: number; percent: number };
  lastTarbiya?: string;
  attendanceToday?: Attendance;
};

export function studentProgress(args: {
  mushaf: Mushaf;
  quran?: QuranEntry[];
  arabic?: ArabicEntry[];
  enrollments?: ArabicEnrollment[];
  books: Map<string, ArabicBook>;
  edu?: EduNote[];
  attendanceToday?: Attendance;
}): StudentProgress {
  const { mushaf, quran } = args;
  const p: StudentProgress = {};

  const hifz = latestOfTrack(quran, "HIFZ");
  if (hifz) {
    // Hifz often runs backwards (Juz' Amma first), so "% of the mushaf" = distinct ayahs ever
    // memorized, not the position of the last ayah.
    const ranges = (quran ?? [])
      .filter((e) => e.track === "HIFZ" && !e.deleted_at)
      .map(entryRange)
      .filter((r): r is QuranRange => !!r);
    const memorizedAyahs = mushaf.coverage(ranges);
    p.hifz = {
      entry: hifz,
      range: entryRange(hifz),
      percent: mushaf.total ? Math.round((memorizedAyahs / mushaf.total) * 100) : null,
      memorizedAyahs,
    };
  }

  const tilawa = latestOfTrack(quran, "TILAWA");
  if (tilawa) {
    const range = entryRange(tilawa);
    p.tilawa = { entry: tilawa, range, percent: range ? mushaf.percent(range.to) : null };
  }

  for (const track of ["MURAJAA", "TALQEEN"] as const) {
    const e = latestOfTrack(quran, track);
    if (e) p[track === "MURAJAA" ? "murajaa" : "talqeen"] = { entry: e, range: entryRange(e), percent: null };
  }

  const active = (args.enrollments ?? []).filter((en) => !en.deleted_at && !en.finished_on);
  const current = active.sort((a, b) => b.started_on.localeCompare(a.started_on))[0];
  if (current) {
    const book = args.books.get(current.book_id);
    if (book) {
      const forBook = (args.arabic ?? []).filter((e) => e.book_id === book.id && !e.deleted_at);
      const top = forBook.reduce<ArabicEntry | undefined>((m, e) => (!m || e.to_page > m.to_page ? e : m), undefined);
      const page = top?.to_page ?? 0;
      p.arabic = { book, entry: top, page, percent: book.total_pages ? Math.round((page / book.total_pages) * 100) : 0 };
    }
  }

  const lastEdu = (args.edu ?? []).filter((n) => !n.deleted_at).map((n) => n.record_date).sort().pop();
  if (lastEdu) p.lastTarbiya = lastEdu;
  if (args.attendanceToday && !args.attendanceToday.deleted_at) p.attendanceToday = args.attendanceToday;
  return p;
}
