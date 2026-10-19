// WhatsApp messages to one family: the day's report, the month's summary and the absence note.
// Built from the device's local copy, so they work offline.

import { entryRange, type Mushaf, type QuranRange } from "@/lib/quran";
import { guardianUrl } from "@/lib/guardian";
import {
  ATTENDANCE_LABEL,
  TRACK_LABEL,
  type Attendance,
  type AttendanceStatus,
  type CircleLesson,
  type QuranEntry,
  type QuranTrack,
  type Student,
} from "@/lib/types";

const DAILY_TRACKS: QuranTrack[] = ["HIFZ", "TILAWA", "MURAJAA", "TALQEEN"];

export function dayName(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  try {
    return new Intl.DateTimeFormat("ar-SY", { weekday: "long", day: "numeric", month: "long" }).format(new Date(y, m - 1, d));
  } catch {
    return date;
  }
}

export function monthName(month: string): string {
  const [y, m] = month.split("-").map(Number);
  try {
    return new Intl.DateTimeFormat("ar-SY", { month: "long", year: "numeric" }).format(new Date(y, m - 1, 1));
  } catch {
    return month;
  }
}

/**
 * The student's lines for one day, in the halaqa's usual report format:
 *   الحفظ: الحشر 10–16 (جيد جدًا)
 *   التلاوة: البقرة 17–20 (جيد جدًا)
 *   الحضور: حاضر
 *   الدرس: أحكام الوضوء
 */
export function dayLines(
  mushaf: Mushaf,
  entries: QuranEntry[],
  attendance: Attendance | undefined,
  lesson: CircleLesson | undefined
): string[] {
  const lines: string[] = [];
  for (const track of DAILY_TRACKS) {
    const list = entries
      .filter((e) => e.track === track && !e.deleted_at)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    if (list.length) {
      lines.push(`${TRACK_LABEL[track]}: ${list.map((e) => `${mushaf.formatRange(entryRange(e))}${e.quality ? ` (${e.quality})` : ""}`).join("، ")}`);
    }
  }
  const status = attendance && !attendance.deleted_at ? (attendance.status as AttendanceStatus) : null;
  if (status) lines.push(`الحضور: ${ATTENDANCE_LABEL[status]}`);
  if (lesson && !lesson.deleted_at && (status === "PRESENT" || status === "LATE")) lines.push(`الدرس: ${lesson.title}`);
  return lines;
}

function footer(token: string | undefined): string {
  return token ? `\n\n🔗 صفحة المتابعة الكاملة:\n${guardianUrl(token)}` : "";
}

/** Masculine or feminine wording: students of the girls' section (إناث) get the feminine. */
const g = (female: boolean, m: string, f: string) => (female ? f : m);

export function dailyMessage(student: Student, date: string, lines: string[], token?: string, female = false): string {
  const body = lines.length ? lines.join("\n") : `لم يُسجَّل ${g(female, "له", "لها")} شيء في هذا اليوم.`;
  return `السلام عليكم ورحمة الله\n📖 تقرير حلقة القرآن — ${dayName(date)}\n\n- ${student.name}\n${body}${footer(token)}`;
}

export type MonthStats = {
  ayat: number;
  recitations: number;
  attended: number;
  days: number;
  rank: number | null;
  rankOf: number;
  exams: string[];
};

export function monthStats(
  mushaf: Mushaf,
  entries: QuranEntry[],
  attendance: Attendance[]
): Pick<MonthStats, "ayat" | "recitations" | "attended" | "days"> {
  const hifz = entries.filter((e) => e.track === "HIFZ" && !e.deleted_at).map(entryRange).filter((r): r is QuranRange => !!r);
  const counted = attendance.filter((a) => !a.deleted_at && a.status !== "EXCUSED");
  return {
    ayat: mushaf.coverage(hifz),
    recitations: entries.filter((e) => (e.track === "TILAWA" || e.track === "MURAJAA") && !e.deleted_at).length,
    attended: counted.filter((a) => a.status === "PRESENT" || a.status === "LATE").length,
    days: counted.length,
  };
}

function times(n: number): string {
  return n === 0 ? "لا يوجد" : n === 1 ? "مرة واحدة" : n === 2 ? "مرتان" : n <= 10 ? `${n} مرات` : `${n} مرة`;
}

export function monthlyMessage(student: Student, month: string, st: MonthStats, token?: string, female = false): string {
  const rate = st.days ? Math.round((st.attended / st.days) * 100) : null;
  const lines = [
    `• الحفظ الجديد: ${st.ayat ? `${st.ayat} آية` : "لا يوجد"}`,
    `• التلاوة والمراجعة: ${times(st.recitations)}`,
    `• الحضور: ${rate === null ? "لم يُسجَّل" : `${rate}% (${st.attended} من ${st.days} ${st.days <= 10 ? "أيام" : "يومًا"})`}`,
  ];
  if (st.rank) lines.push(`• الترتيب في الحلقة: ${st.rank} من ${st.rankOf}`);
  for (const x of st.exams) lines.push(`• ${x}`);
  const cheer =
    rate !== null && rate < 60
      ? `نرجو الحرص على المواظبة على الحضور، فالاستمرار سرّ الإتقان، ونحن ${g(female, "بانتظاره", "بانتظارها")}.`
      : (rate ?? 0) >= 90 && st.ayat > 0
        ? `ما شاء الله، أداء متميز هذا الشهر. بارك الله ${g(female, "فيه", "فيها")}، وجزاكم الله خيرًا على المتابعة.`
        : `نسأل الله أن يبارك ${g(female, "فيه ويجعله", "فيها ويجعلها")} من أهل القرآن، وجزاكم الله خيرًا على المتابعة.`;
  return `السلام عليكم ورحمة الله\n📊 ملخص شهر ${monthName(month)} — ${student.name}\n\n${lines.join("\n")}\n\n${cheer}${footer(token)}`;
}

// {الاسم} and {العدد} are filled in; {ه} becomes ه or ها, {يكون} يكون or تكون, for the student.
export const DEFAULT_ABSENCE_MESSAGE =
  "السلام عليكم ورحمة الله، نرجو أن تكونوا بخير.\nافتقدنا {الاسم} في حلقة القرآن آخر {العدد} أيام، ونتمنى أن {يكون} بخير وعافية.\nإن كان هناك ما نستطيع المساعدة فيه فنحن حاضرون، ونسعد بعودت{ه} قريبًا بإذن الله.";

export function absenceMessage(template: string, student: Student, days: number, female = false): string {
  return (template || DEFAULT_ABSENCE_MESSAGE)
    .replaceAll("{الاسم}", student.name)
    .replaceAll("{العدد}", String(days))
    .replaceAll("{ه}", g(female, "ه", "ها"))
    .replaceAll("{يكون}", g(female, "يكون", "تكون"));
}
