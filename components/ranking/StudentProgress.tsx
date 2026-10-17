"use client";

import { useApp } from "@/components/AppContext";
import MiniChart from "@/components/ranking/MiniChart";
import { useRankData } from "@/components/ranking/useRankData";
import { entryRange, type QuranRange } from "@/lib/quran";
import { computeRanking, weeksSince, type RankingSettings } from "@/lib/ranking";
import { addDays, todayStr, type Student } from "@/lib/types";

// One student's progress week by week since the course started: memorised ayat so far, average
// grade, attendance and rank among the students of the same filter.
export default function StudentProgress({
  student,
  pool,
  circleId,
  settings,
  onBack,
}: {
  student: Student;
  pool: Student[];
  circleId: string | null;
  settings: RankingSettings;
  onBack: () => void;
}) {
  const { mushaf } = useApp();
  const today = todayStr();
  const start = settings.courseStart ?? addDays(today, -55);
  const { data, partial } = useRankData(start, today, circleId);
  const weeks = weeksSince(start, today, settings.weekStart);

  const hifzRanges = data.quran
    .filter((e) => e.student_id === student.id && e.track === "HIFZ")
    .map((e) => ({ date: e.entry_date, r: entryRange(e) }))
    .filter((x): x is { date: string; r: QuranRange } => !!x.r);
  const grade = (q: string | null) => (q != null && settings.grades[q] != null ? Number(settings.grades[q]) : null);

  const rows = weeks.map((ws) => {
    const we = addDays(ws, 6);
    const ranking = computeRanking(pool, data, settings, mushaf, ws, we);
    const mine = [...ranking.ranked, ...ranking.unranked].find((r) => r.student.id === student.id);
    const grades = data.quran
      .filter((e) => e.student_id === student.id && e.entry_date >= ws && e.entry_date <= we && e.track !== "TALQEEN")
      .map((e) => grade(e.quality))
      .filter((g): g is number => g != null);
    return {
      label: ws.slice(5).replace("-", "/"),
      from: ws,
      to: we,
      cumulative: mushaf.coverage(hifzRanges.filter((x) => x.date <= we).map((x) => x.r)),
      grade: grades.length ? Math.round((grades.reduce((a, b) => a + b, 0) / grades.length) * 10) / 10 : null,
      attendance: mine && mine.days ? Math.round((mine.attended / mine.days) * 100) : null,
      rank: mine?.rank ?? null,
      of: ranking.ranked.length,
      total: mine?.total ?? null,
      reason: mine?.reason ?? "",
    };
  });

  return (
    <section>
      <div className="card">
        <div className="title">
          <h3>📈 تقدّم {student.name}</h3>
          <button className="secondary no-print" onClick={onBack}>
            → رجوع للترتيب
          </button>
        </div>
        <p className="muted">
          أسبوعًا بأسبوع منذ بداية الدورة ({start}). الترتيب بين طلاب الفرز الحالي.
        </p>
        {partial && <div className="notice">بدون اتصال: الأسابيع الأقدم من بيانات هذا الجهاز فقط وقد تكون ناقصة.</div>}
        <div className="charts">
          <MiniChart title="الحفظ التراكمي (آية)" points={rows.map((r) => ({ label: r.label, value: r.cumulative }))} />
          <MiniChart title="معدل التقدير" points={rows.map((r) => ({ label: r.label, value: r.grade }))} max={100} color="var(--gold)" />
          <MiniChart title="نسبة الحضور" points={rows.map((r) => ({ label: r.label, value: r.attendance }))} max={100} unit="%" color="var(--blue)" />
          <MiniChart
            title="الترتيب (1 = الأول)"
            points={rows.map((r) => ({ label: r.label, value: r.rank }))}
            max={Math.max(2, ...rows.map((r) => r.of))}
            invert
            color="var(--g2)"
          />
        </div>
      </div>
      <div className="card">
        <h3>التفاصيل</h3>
        <div style={{ overflow: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>الأسبوع</th>
                <th>الحفظ التراكمي</th>
                <th>معدل التقدير</th>
                <th>الحضور</th>
                <th>المعدل النهائي</th>
                <th>الترتيب</th>
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map((r) => (
                <tr key={r.from}>
                  <td>
                    {r.from} ← {r.to}
                  </td>
                  <td>{r.cumulative} آية</td>
                  <td>{r.grade ?? "—"}</td>
                  <td>{r.attendance == null ? "—" : `${r.attendance}%`}</td>
                  <td>{r.total ?? "—"}</td>
                  <td>{r.rank ? `${r.rank} من ${r.of}` : <span className="muted">{r.reason || "—"}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
