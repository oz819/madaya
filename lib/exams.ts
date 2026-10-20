// الاختبارات: labels, juz' names for certificates, and who is ready for a juz' exam.

import { entryRange, type Mushaf, type QuranRange } from "@/lib/quran";
import { juzProgress } from "@/lib/juz";
import type { Exam, ExamKind, QuranEntry, Student } from "@/lib/types";

export const EXAM_KIND_LABEL: Record<ExamKind, string> = {
  JUZ: "اختبار جزء",
  SURAH: "اختبار سورة",
  MONTHLY: "السبر الشهري",
};

const ORDINALS = [
  "الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن", "التاسع", "العاشر",
  "الحادي عشر", "الثاني عشر", "الثالث عشر", "الرابع عشر", "الخامس عشر", "السادس عشر", "السابع عشر", "الثامن عشر", "التاسع عشر", "العشرون",
  "الحادي والعشرون", "الثاني والعشرون", "الثالث والعشرون", "الرابع والعشرون", "الخامس والعشرون", "السادس والعشرون", "السابع والعشرون", "الثامن والعشرون", "التاسع والعشرون", "الثلاثون",
];

// The last juz' are usually called by their first word.
const JUZ_NAMES: Record<number, string> = { 30: "جزء عمّ", 29: "جزء تبارك", 28: "جزء قد سمع", 27: "جزء الذاريات", 26: "جزء الأحقاف" };

/** "الجزء الثلاثون (جزء عمّ)" */
export function juzTitle(n: number): string {
  return `الجزء ${ORDINALS[n - 1] ?? n}${JUZ_NAMES[n] ? ` (${JUZ_NAMES[n]})` : ""}`;
}

export function examTitle(x: Pick<Exam, "kind" | "juz_no" | "surah_no">, mushaf: Mushaf): string {
  if (x.kind === "JUZ") return `اختبار الجزء ${x.juz_no}`;
  if (x.kind === "SURAH") return `اختبار سورة ${mushaf.name(x.surah_no)}`;
  return "السبر الشهري";
}

/** Lines for the month summary: «نجح في اختبار الجزء 30 (95)». */
export function examLines(exams: Exam[], studentId: string, from: string, to: string, mushaf: Mushaf): string[] {
  return exams
    .filter((x) => x.student_id === studentId && !x.deleted_at && x.exam_date >= from && x.exam_date <= to)
    .sort((a, b) => a.exam_date.localeCompare(b.exam_date))
    .map((x) => `${x.passed ? "نجح في" : "تقدّم إلى"} ${examTitle(x, mushaf)} (${Number(x.score)})`);
}

export type ReadyForExam = { student: Student; juz: number };

/**
 * المرحلة 11: students who have memorized a whole juz' (by their hifz entries) and haven't
 * passed that juz' exam yet.
 */
export function readyForExam(mushaf: Mushaf, students: Student[], quranBy: Map<string, QuranEntry[]>, exams: Exam[]): ReadyForExam[] {
  const passed = new Set(exams.filter((x) => !x.deleted_at && x.passed && x.kind === "JUZ").map((x) => `${x.student_id}|${x.juz_no}`));
  const out: ReadyForExam[] = [];
  for (const student of students) {
    const ranges = (quranBy.get(student.id) ?? [])
      .filter((e) => e.track === "HIFZ" && !e.deleted_at)
      .map(entryRange)
      .filter((r): r is QuranRange => !!r);
    if (!ranges.length) continue;
    for (const j of juzProgress(mushaf, ranges)) {
      if (j.percent === 100 && !passed.has(`${student.id}|${j.juz}`)) out.push({ student, juz: j.juz });
    }
  }
  return out.sort((a, b) => a.student.name.localeCompare(b.student.name, "ar") || b.juz - a.juz);
}
