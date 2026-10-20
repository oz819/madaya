// المتفوقون: turns what teachers record into a score out of 100 per item and a weighted total.
//
//   الحفظ      half the amount memorised (ayat, against the best student in the same filter),
//              half the average grade of those hifz entries
//   التلاوة    average grade of tilawa and muraja'a entries
//   الحضور     share of the halaqa's days the student came (late counts as present; excused days
//              don't count). A "halaqa day" is any day attendance was taken for someone in it.
//   التربية    average grade of graded tarbiya notes
//   الأنشطة    share of the activities of the student's halaqa they attended
//
// An item nobody has data for in the period is skipped and its weight shared by the others.
// A student without a tarbiya grade, or whose halaqa had no activity, gets the same treatment for
// that item. Students who came less than half the time, or have no graded recitation, are listed
// apart as «بيانات غير كافية» instead of ranked.

import { entryRange, type Mushaf, type QuranRange } from "@/lib/quran";
import { addDays, localDateStr, type Activity, type Attendance, type Exam, type QuranEntry, type Student } from "@/lib/types";

export type ItemKey = "hifz" | "tilawa" | "attendance" | "tarbiya" | "activities" | "exams";

export const ITEMS: { key: ItemKey; label: string }[] = [
  { key: "hifz", label: "الحفظ" },
  { key: "tilawa", label: "التلاوة والمراجعة" },
  { key: "attendance", label: "الحضور" },
  { key: "tarbiya", label: "التربية والسلوك" },
  { key: "activities", label: "الدورات والأنشطة" },
  { key: "exams", label: "الاختبارات" },
];

export type Weights = Record<ItemKey, number>;

export type RankingSettings = {
  weights: Weights;
  /** What each grade is worth out of 100. */
  grades: Record<string, number>;
  /** First day of the week, as Date.getDay(): 0 Sunday … 6 Saturday. */
  weekStart: number;
  courseStart: string | null;
  /** تنبيه الغياب: flag a student after this many absences in a row. */
  absenceThreshold: number;
  /** The admin's wording of the message to the family; null for the default. */
  absenceMessage: string | null;
  /** Score out of 100 needed to pass an exam. */
  passMark: number;
};

export const DEFAULT_SETTINGS: RankingSettings = {
  weights: { hifz: 40, tilawa: 20, attendance: 20, tarbiya: 10, activities: 10, exams: 0 },
  grades: { ممتاز: 100, "جيد جدًا": 85, جيد: 70, تمكين: 60, إعادة: 40 },
  weekStart: 6,
  courseStart: null,
  absenceThreshold: 3,
  absenceMessage: null,
  passMark: 70,
};

export const WEEK_DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export const MIN_ATTENDANCE = 0.5;

export type TarbiyaGrade = { student_id: string; record_date: string; quality: string | null };

export type RankData = {
  quran: QuranEntry[];
  attendance: Attendance[];
  tarbiya: TarbiyaGrade[];
  activities: Activity[];
  /** Optional: older callers and servers without exams pass none. */
  exams?: Pick<Exam, "student_id" | "exam_date" | "score" | "deleted_at">[];
};

export type StudentScore = {
  student: Student;
  /** Score out of 100 per item; null when the item doesn't apply to this student. */
  items: Record<ItemKey, number | null>;
  ayat: number;
  attended: number;
  days: number;
  activitiesAttended: number;
  activitiesTotal: number;
  total: number | null;
  /** Why the student isn't ranked; empty when ranked. */
  reason: string;
  rank: number | null;
};

export type Ranking = {
  ranked: StudentScore[];
  unranked: StudentScore[];
  /** Items nobody had data for: their weight went to the others. */
  skipped: ItemKey[];
};

export function weightsTotal(w: Weights): number {
  return ITEMS.reduce((n, i) => n + (Number(w[i.key]) || 0), 0);
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round1 = (x: number) => Math.round(x * 10) / 10;

export function computeRanking(
  students: Student[],
  data: RankData,
  settings: RankingSettings,
  mushaf: Mushaf,
  from: string,
  to: string
): Ranking {
  const inPeriod = (d: string) => d >= from && d <= to;
  const ids = new Set(students.map((s) => s.id));
  const grade = (q: string | null) => (q != null && settings.grades[q] != null ? Number(settings.grades[q]) : null);

  const quran = data.quran.filter((e) => ids.has(e.student_id) && inPeriod(e.entry_date) && !e.deleted_at);
  const attendance = data.attendance.filter((a) => ids.has(a.student_id) && inPeriod(a.att_date) && !a.deleted_at);
  const tarbiya = data.tarbiya.filter((n) => ids.has(n.student_id) && inPeriod(n.record_date));
  const activities = data.activities.filter((a) => inPeriod(a.activity_date) && !a.deleted_at);
  const exams = (data.exams ?? []).filter((x) => ids.has(x.student_id) && inPeriod(x.exam_date) && !x.deleted_at);

  const circleOf = new Map(students.map((s) => [s.id, s.circle_id]));
  const circleDays = new Map<string, Set<string>>();
  for (const a of attendance) {
    const c = circleOf.get(a.student_id)!;
    if (!circleDays.has(c)) circleDays.set(c, new Set());
    circleDays.get(c)!.add(a.att_date);
  }

  const byStudent = <T extends { student_id: string }>(list: T[]) => {
    const m = new Map<string, T[]>();
    for (const x of list) {
      const l = m.get(x.student_id);
      if (l) l.push(x);
      else m.set(x.student_id, [x]);
    }
    return m;
  };
  const quranBy = byStudent(quran);
  const attBy = byStudent(attendance);
  const tarbiyaBy = byStudent(tarbiya);
  const examsBy = byStudent(exams);

  const ayatOf = new Map<string, number>();
  for (const s of students) {
    const ranges = (quranBy.get(s.id) ?? [])
      .filter((e) => e.track === "HIFZ")
      .map(entryRange)
      .filter((r): r is QuranRange => !!r);
    ayatOf.set(s.id, mushaf.coverage(ranges));
  }
  const maxAyat = Math.max(0, ...ayatOf.values());

  const has: Record<ItemKey, boolean> = {
    hifz: quran.some((e) => e.track === "HIFZ"),
    tilawa: quran.some((e) => (e.track === "TILAWA" || e.track === "MURAJAA") && grade(e.quality) != null),
    attendance: attendance.length > 0,
    tarbiya: tarbiya.some((n) => grade(n.quality) != null),
    activities: activities.length > 0,
    exams: exams.length > 0,
  };
  const anyGraded = quran.some((e) => e.track !== "TALQEEN" && grade(e.quality) != null);

  const scores: StudentScore[] = students.map((s) => {
    const entries = quranBy.get(s.id) ?? [];
    const joined = s.created_at.slice(0, 10);
    const ayat = ayatOf.get(s.id) ?? 0;

    const hifzGrade = avg(entries.filter((e) => e.track === "HIFZ").map((e) => grade(e.quality)).filter((g): g is number => g != null));
    const amount = maxAyat ? (ayat / maxAyat) * 100 : 0;
    const hifz = hifzGrade == null ? amount : (amount + hifzGrade) / 2;

    const tilawa =
      avg(
        entries
          .filter((e) => e.track === "TILAWA" || e.track === "MURAJAA")
          .map((e) => grade(e.quality))
          .filter((g): g is number => g != null)
      ) ?? 0;

    const mine = new Map((attBy.get(s.id) ?? []).map((a) => [a.att_date, a.status]));
    let days = 0;
    let attended = 0;
    for (const d of circleDays.get(s.circle_id) ?? []) {
      if (d < joined && !mine.has(d)) continue; // before the student joined
      const st = mine.get(d);
      if (st === "EXCUSED") continue;
      days++;
      if (st === "PRESENT" || st === "LATE") attended++;
    }
    const attendanceScore = days ? (attended / days) * 100 : null;

    const tarbiyaScore = avg((tarbiyaBy.get(s.id) ?? []).map((n) => grade(n.quality)).filter((g): g is number => g != null));

    const theirs = activities.filter((a) => (!a.circle_id || a.circle_id === s.circle_id) && (a.activity_date >= joined || a.student_ids.includes(s.id)));
    const went = theirs.filter((a) => a.student_ids.includes(s.id)).length;
    const activitiesScore = theirs.length ? (went / theirs.length) * 100 : null;

    const examScore = avg((examsBy.get(s.id) ?? []).map((x) => Number(x.score)));

    const items: Record<ItemKey, number | null> = {
      hifz: has.hifz ? round1(hifz) : null,
      tilawa: has.tilawa ? round1(tilawa) : null,
      attendance: has.attendance && attendanceScore != null ? round1(attendanceScore) : null,
      tarbiya: has.tarbiya && tarbiyaScore != null ? round1(tarbiyaScore) : null,
      activities: has.activities && activitiesScore != null ? round1(activitiesScore) : null,
      exams: has.exams && examScore != null ? round1(examScore) : null,
    };

    let wSum = 0;
    let acc = 0;
    for (const { key } of ITEMS) {
      const w = Number(settings.weights[key]) || 0;
      const v = items[key];
      if (!w || v == null) continue;
      wSum += w;
      acc += w * v;
    }
    const total = wSum ? round1(acc / wSum) : null;

    const graded = entries.some((e) => e.track !== "TALQEEN" && grade(e.quality) != null);
    let reason = "";
    if (!entries.length && !days) reason = "لا توجد بيانات";
    else if (days && attended / days < MIN_ATTENDANCE) reason = `حضر ${attended} من ${days} أيام (أقل من النصف)`;
    else if (anyGraded && !graded) reason = "لا توجد تقديرات تسميع";
    else if (total == null) reason = "لا توجد بيانات";

    return {
      student: s,
      items,
      ayat,
      attended,
      days,
      activitiesAttended: went,
      activitiesTotal: theirs.length,
      total,
      reason,
      rank: null,
    };
  });

  const ranked = scores
    .filter((r) => !r.reason)
    .sort((a, b) => b.total! - a.total! || a.student.name.localeCompare(b.student.name, "ar"));
  // Ties share a rank (1, 1, 3).
  ranked.forEach((r, i) => (r.rank = i && ranked[i - 1].total === r.total ? ranked[i - 1].rank : i + 1));
  const unranked = scores.filter((r) => r.reason).sort((a, b) => a.student.name.localeCompare(b.student.name, "ar"));

  const skipped = ITEMS.filter((i) => (Number(settings.weights[i.key]) || 0) > 0 && !has[i.key]).map((i) => i.key);
  return { ranked, unranked, skipped };
}

// ---------- periods ----------

export type PeriodKind = "week" | "lastWeek" | "month" | "course" | "range";

export const PERIOD_LABEL: Record<PeriodKind, string> = {
  week: "هذا الأسبوع",
  lastWeek: "الأسبوع الماضي",
  month: "هذا الشهر",
  course: "الدورة كاملة",
  range: "من تاريخ إلى تاريخ",
};

export function weekStartOf(date: string, weekStart: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const day = new Date(y, m - 1, d).getDay();
  return addDays(date, -((day - weekStart + 7) % 7));
}

/** The period's dates, and the one before it to compare ranks with (null when there's none). */
export function periodRange(
  kind: PeriodKind,
  today: string,
  settings: RankingSettings,
  range: { from: string; to: string }
): { from: string; to: string; prev: { from: string; to: string } | null } {
  const ws = weekStartOf(today, settings.weekStart);
  if (kind === "week") return { from: ws, to: addDays(ws, 6), prev: { from: addDays(ws, -7), to: addDays(ws, -1) } };
  if (kind === "lastWeek") return { from: addDays(ws, -7), to: addDays(ws, -1), prev: { from: addDays(ws, -14), to: addDays(ws, -8) } };
  if (kind === "month") {
    const [y, m] = today.split("-").map(Number);
    const first = localDateStr(new Date(y, m - 1, 1));
    const last = localDateStr(new Date(y, m, 0));
    return { from: first, to: last, prev: { from: localDateStr(new Date(y, m - 2, 1)), to: addDays(first, -1) } };
  }
  if (kind === "course") return { from: settings.courseStart ?? addDays(today, -59), to: today, prev: null };
  const from = range.from <= range.to ? range.from : range.to;
  const to = range.from <= range.to ? range.to : range.from;
  const len = daysBetween(from, to) + 1;
  return { from, to, prev: { from: addDays(from, -len), to: addDays(from, -1) } };
}

export function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

/** Week-by-week starts from the course start (or `from`) up to today. */
export function weeksSince(from: string, today: string, weekStart: number): string[] {
  const out: string[] = [];
  for (let w = weekStartOf(from, weekStart); w <= today; w = addDays(w, 7)) out.push(w);
  return out;
}
