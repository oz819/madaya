import type { Tables } from "@/lib/supabase/database.types";

export type Role = "ADMIN" | "TEACHER";

export type Profile = {
  id: string;
  name: string;
  role: Role;
  active: boolean;
};

export type Surah = { surah_no: number; name: string; ayah_count: number };

export type Circle = Tables<"circles">;
export type Student = Tables<"students">;
export type QuranEntry = Tables<"quran_entries">;
export type Attendance = Tables<"attendance">;
export type ArabicBook = Tables<"arabic_books">;
export type ArabicEnrollment = Tables<"student_arabic_enrollments">;
export type ArabicEntry = Tables<"arabic_entries">;
export type EduNote = Tables<"edu_notes">;
export type TalqeenSession = Tables<"talqeen_sessions">;

export type QuranTrack = "HIFZ" | "TILAWA" | "MURAJAA" | "TALQEEN";

export const TRACK_LABEL: Record<QuranTrack, string> = {
  HIFZ: "الحفظ",
  TILAWA: "التلاوة",
  MURAJAA: "المراجعة",
  TALQEEN: "التلقين",
};

export type AttendanceStatus = "PRESENT" | "LATE" | "EXCUSED" | "ABSENT";

export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  PRESENT: "حاضر",
  LATE: "متأخر",
  EXCUSED: "غائب بعذر",
  ABSENT: "غائب",
};

export const EDU_AREAS = [
  "المواظبة والانضباط",
  "الجدية والمثابرة",
  "الإتقان والمسؤولية",
  "أدب الحلقة",
  "الأثر القرآني والمبادرة",
] as const;

export const QUALITIES = ["ممتاز", "جيد جدًا", "جيد", "إعادة", "تمكين"] as const;

// Local calendar date (YYYY-MM-DD). toISOString() would give the UTC date, which is the wrong day
// for entries made after midnight local time in UTC+ zones.
export function todayStr(): string {
  return localDateStr(new Date());
}

export function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return localDateStr(new Date(y, m - 1, d + days));
}
