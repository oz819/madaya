export type Profile = {
  id: string;
  name: string;
  role: "ADMIN" | "TEACHER";
  active: boolean;
};

export type Circle = {
  id: string;
  name: string;
  teacher_id: string | null;
};

export type Surah = { surah_no: number; name: string; ayah_count: number };

export type StudentRow = {
  id: string;
  name: string;
  circle_id: string;
  circle_name: string;
  teacher_name: string | null;
  current_surah: string | null;
  current_surah_no: number | null;
  current_from_ayah: number | null;
  current_to_ayah: number | null;
  current_grade: string | null;
  score: number;
  score_label: string;
  rank_value: number;
};

export const WORK_TYPE_LABEL: Record<string, string> = {
  NEW_MEMORIZATION: "حفظ جديد",
  REVIEW: "مراجعة",
  TILAWAH: "تلاوة",
};

export const EDU_AREAS = [
  "المواظبة والانضباط",
  "الجدية والمثابرة",
  "الإتقان والمسؤولية",
  "أدب الحلقة",
  "الأثر القرآني والمبادرة",
] as const;

export const GRADES = ["", "ممتاز", "جيد جدًا", "جيد", "إعادة", "تمكين"] as const;
export const TILAWAH_GRADES = ["ممتاز", "جيد جدًا", "جيد", "إعادة", "تمكين"] as const;

export function ayahsBefore(surahs: Surah[], surahNo: number): number {
  let n = 0;
  for (const s of surahs) {
    if (s.surah_no < surahNo) n += s.ayah_count;
  }
  return n;
}

export function tilawahPercent(surahs: Surah[], surahNo: number, ayah: number): number {
  const total = surahs.reduce((sum, s) => sum + s.ayah_count, 0);
  if (!total) return 0;
  return Math.round(((ayahsBefore(surahs, surahNo) + (ayah || 0)) / total) * 100);
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
