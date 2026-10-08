"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/AppContext";
import ProgressRing from "@/components/ProgressRing";
import { LOCAL_WINDOW_DAYS, useStore } from "@/lib/offline/store";
import { entryRange, type Mushaf, type QuranRange } from "@/lib/quran";
import {
  ATTENDANCE_LABEL,
  TRACK_LABEL,
  addDays,
  todayStr,
  type ArabicBook,
  type ArabicEntry,
  type Attendance,
  type AttendanceStatus,
  type QuranEntry,
  type QuranTrack,
  type Student,
} from "@/lib/types";

type TrackKey = QuranTrack | "ARABIC" | "TARBIYA" | "ATTENDANCE";
const TRACKS: { id: TrackKey; label: string }[] = [
  { id: "HIFZ", label: "الحفظ" },
  { id: "TILAWA", label: "التلاوة" },
  { id: "MURAJAA", label: "المراجعة" },
  { id: "TALQEEN", label: "التلقين" },
  { id: "ARABIC", label: "العربية" },
  { id: "TARBIYA", label: "التربية" },
  { id: "ATTENDANCE", label: "الحضور" },
];

type Period = "day" | "range" | "month";
type TarbiyaRow = { id: string; student_id: string; record_date: string; area: string; note: string };
type ReportData = { quran: QuranEntry[]; arabic: ArabicEntry[]; tarbiya: TarbiyaRow[]; attendance: Attendance[] };

type Cell = { text: string; empty: boolean };
type Row = { student: Student; cells: Partial<Record<TrackKey, Cell>> };

// Flexible reporting (spec §5.3): scope × period × tracks. Built server-side by report_data();
// offline it falls back to this device's local copy and says so.
export default function Reports() {
  const s = useStore();
  const { supabase, mushaf } = useApp();
  const circles = s.all("circles").filter((c) => c.active).sort((a, b) => a.name.localeCompare(b.name, "ar"));
  const allStudents = s.all("students").filter((st) => st.active).sort((a, b) => a.name.localeCompare(b.name, "ar"));

  const [scope, setScope] = useState<"all" | "circle" | "student">("all");
  const [circleId, setCircleId] = useState(circles[0]?.id ?? "");
  const [studentId, setStudentId] = useState(allStudents[0]?.id ?? "");
  const [period, setPeriod] = useState<Period>("day");
  const [day, setDay] = useState(todayStr());
  const [from, setFrom] = useState(addDays(todayStr(), -6));
  const [to, setTo] = useState(todayStr());
  const [month, setMonth] = useState(todayStr().slice(0, 7));
  const [tracks, setTracks] = useState<Set<TrackKey>>(new Set(["HIFZ", "TILAWA", "MURAJAA", "TALQEEN", "ATTENDANCE"]));
  const [data, setData] = useState<ReportData | null>(null);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [pFrom, pTo] =
    period === "day"
      ? [day, day]
      : period === "range"
        ? [from, to]
        : [`${month}-01`, addDays(`${addMonth(month)}-01`, -1)];

  const students = allStudents.filter(
    (st) => scope === "all" || (scope === "circle" ? st.circle_id === circleId : st.id === studentId)
  );
  const studentIds = new Set(students.map((st) => st.id));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      const local = (): ReportData => ({
        quran: s.all("quran_entries").filter((e) => !e.deleted_at && e.entry_date >= pFrom && e.entry_date <= pTo),
        arabic: s.all("arabic_entries").filter((e) => !e.deleted_at && e.entry_date >= pFrom && e.entry_date <= pTo),
        tarbiya: s.all("edu_notes").filter((n) => !n.deleted_at && n.record_date >= pFrom && n.record_date <= pTo),
        attendance: s.all("attendance").filter((a) => !a.deleted_at && a.att_date >= pFrom && a.att_date <= pTo),
      });
      if (!navigator.onLine) {
        if (!cancelled) {
          setData(local());
          setOffline(true);
          setLoading(false);
        }
        return;
      }
      const { data: res, error: err } = await supabase.rpc("report_data", {
        p_from: pFrom,
        p_to: pTo,
        ...(scope === "circle" ? { p_circle_id: circleId } : {}),
        ...(scope === "student" ? { p_student_id: studentId } : {}),
      });
      if (cancelled) return;
      if (err) {
        setData(local());
        setOffline(true);
        if (!/fetch|network/i.test(err.message)) setError(err.message);
      } else {
        setData(res as unknown as ReportData);
        setOffline(false);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // Re-query when the filters change; local data changes don't need a server round trip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, pFrom, pTo, scope, circleId, studentId]);

  const books = s.lookup("arabic_books");
  const filtered: ReportData | null = data && {
    quran: data.quran.filter((e) => studentIds.has(e.student_id)),
    arabic: data.arabic.filter((e) => studentIds.has(e.student_id)),
    tarbiya: data.tarbiya.filter((n) => studentIds.has(n.student_id)),
    attendance: data.attendance.filter((a) => studentIds.has(a.student_id)),
  };
  const chosen = TRACKS.filter((t) => tracks.has(t.id));
  const rows = filtered ? buildRows(students, filtered, chosen.map((t) => t.id), period, mushaf, books) : [];
  const scopeLabel =
    scope === "all" ? "جميع الحلقات" : scope === "circle" ? s.get("circles", circleId)?.name ?? "—" : s.get("students", studentId)?.name ?? "—";
  const periodLabel = period === "day" ? pFrom : period === "month" ? month : `${pFrom} ← ${pTo}`;
  const whatsapp = buildWhatsApp(rows, chosen, scopeLabel, periodLabel);
  const timeline = scope === "student" && filtered ? buildTimeline(filtered, chosen.map((t) => t.id), mushaf, books) : null;

  function copy() {
    navigator.clipboard?.writeText(whatsapp);
  }

  function csv() {
    const header = ["الطالب", ...chosen.map((t) => t.label)];
    const lines = [header, ...rows.map((r) => [r.student.name, ...chosen.map((t) => r.cells[t.id]?.text ?? "")])];
    const body = lines.map((l) => l.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + body], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `report-${pFrom}-${pTo}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <section>
      <div className="card no-print">
        <h3>📊 التقارير</h3>
        <div className="formgrid compact">
          <div>
            <label>النطاق</label>
            <select value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
              <option value="all">كل الطلاب</option>
              <option value="circle">حلقة</option>
              <option value="student">طالب</option>
            </select>
          </div>
          {scope === "circle" && (
            <div>
              <label>الحلقة</label>
              <select value={circleId} onChange={(e) => setCircleId(e.target.value)}>
                {circles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {scope === "student" && (
            <div>
              <label>الطالب</label>
              <select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                {allStudents.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label>الفترة</label>
            <select value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
              <option value="day">يوم</option>
              <option value="range">من تاريخ إلى تاريخ</option>
              <option value="month">شهر</option>
            </select>
          </div>
          {period === "day" && (
            <div>
              <label>اليوم</label>
              <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
            </div>
          )}
          {period === "range" && (
            <>
              <div>
                <label>من</label>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div>
                <label>إلى</label>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </>
          )}
          {period === "month" && (
            <div>
              <label>الشهر</label>
              <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            </div>
          )}
        </div>
        <div className="recent" style={{ marginTop: 10 }}>
          <span className="muted">المسارات:</span>
          {TRACKS.map((t) => (
            <label key={t.id} className="chip inline">
              <input
                type="checkbox"
                checked={tracks.has(t.id)}
                onChange={(e) => {
                  const next = new Set(tracks);
                  if (e.target.checked) next.add(t.id);
                  else next.delete(t.id);
                  setTracks(next);
                }}
              />
              {t.label}
            </label>
          ))}
        </div>
      </div>

      {offline && (
        <div className="notice no-print">
          بدون اتصال: التقرير من بيانات هذا الجهاز فقط وقد يكون ناقصًا
          {pFrom < addDays(todayStr(), -LOCAL_WINDOW_DAYS) && ` (الجهاز يحتفظ بآخر ${LOCAL_WINDOW_DAYS} يومًا فقط)`}.
        </div>
      )}
      {error && <p className="error-text">{error}</p>}

      <div className="card print-area">
        <div className="title">
          <h3>
            {scopeLabel} — {periodLabel}
          </h3>
          <div className="row-actions no-print">
            <button className="secondary" onClick={copy}>
              نسخ لواتساب
            </button>
            <button className="secondary" onClick={() => window.print()}>
              طباعة / PDF
            </button>
            <button className="secondary" onClick={csv}>
              CSV
            </button>
          </div>
        </div>
        {filtered && <SummaryRings data={filtered} studentCount={students.length} />}
        {loading && !data ? (
          <p className="muted">جارٍ التحميل...</p>
        ) : timeline ? (
          timeline.length ? (
            <table>
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>المسار</th>
                  <th>التفاصيل</th>
                </tr>
              </thead>
              <tbody>
                {timeline.map((t, i) => (
                  <tr key={i}>
                    <td>{t.date}</td>
                    <td>{t.track}</td>
                    <td>{t.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="muted">لا توجد إدخالات في هذه الفترة.</p>
          )
        ) : (
          <div style={{ overflow: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>الطالب</th>
                  {chosen.map((t) => (
                    <th key={t.id}>{t.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.student.id}>
                    <td>
                      <b>{r.student.name}</b>
                    </td>
                    {chosen.map((t) => (
                      <td key={t.id} className={r.cells[t.id]?.empty ? "muted" : ""}>
                        {r.cells[t.id]?.text}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function addMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

function groupBy<T>(list: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of list) {
    const k = key(x);
    const l = m.get(k);
    if (l) l.push(x);
    else m.set(k, [x]);
  }
  return m;
}

function buildRows(
  students: Student[],
  d: ReportData,
  tracks: TrackKey[],
  period: Period,
  mushaf: Mushaf,
  books: Map<string, ArabicBook>
): Row[] {
  const quran = groupBy(d.quran, (e) => e.student_id);
  const arabic = groupBy(d.arabic, (e) => e.student_id);
  const tarbiya = groupBy(d.tarbiya, (n) => n.student_id);
  const att = groupBy(d.attendance, (a) => a.student_id);
  const empty = (text = period === "day" ? "لم يُسجَّل" : "—"): Cell => ({ text, empty: true });

  return students.map((student) => {
    const cells: Row["cells"] = {};
    for (const t of tracks) {
      if (t === "ATTENDANCE") {
        const list = att.get(student.id) ?? [];
        if (period === "day") {
          cells[t] = list[0] ? { text: ATTENDANCE_LABEL[list[0].status as AttendanceStatus], empty: false } : empty();
        } else {
          const counts = new Map<string, number>();
          for (const a of list) counts.set(a.status, (counts.get(a.status) ?? 0) + 1);
          cells[t] = list.length
            ? {
                text: (["PRESENT", "LATE", "EXCUSED", "ABSENT"] as AttendanceStatus[])
                  .filter((st) => counts.get(st))
                  .map((st) => `${ATTENDANCE_LABEL[st]} ${counts.get(st)}`)
                  .join("، "),
                empty: false,
              }
            : empty();
        }
      } else if (t === "ARABIC") {
        const list = (arabic.get(student.id) ?? []).sort((a, b) => a.entry_date.localeCompare(b.entry_date));
        if (!list.length) cells[t] = empty();
        else if (period === "day") {
          cells[t] = { text: list.map((e) => `${books.get(e.book_id)?.title ?? ""} ص ${e.from_page}–${e.to_page}`).join("، "), empty: false };
        } else {
          const pages = list.reduce((n, e) => n + e.to_page - e.from_page + 1, 0);
          cells[t] = { text: `${pages} صفحة (ص ${list[0].from_page} ← ${Math.max(...list.map((e) => e.to_page))})`, empty: false };
        }
      } else if (t === "TARBIYA") {
        const list = tarbiya.get(student.id) ?? [];
        cells[t] = list.length
          ? { text: period === "day" ? list.map((n) => `${n.area}: ${n.note}`).join(" | ") : `${list.length} ملاحظة`, empty: false }
          : empty();
      } else {
        const list = (quran.get(student.id) ?? [])
          .filter((e) => e.track === t)
          .sort((a, b) => a.entry_date.localeCompare(b.entry_date) || a.created_at.localeCompare(b.created_at));
        const ranges = list.map(entryRange).filter((r): r is QuranRange => !!r);
        if (!list.length) cells[t] = empty();
        else if (period === "day") {
          cells[t] = {
            text: list.map((e) => `${mushaf.formatRange(entryRange(e))}${e.quality ? ` (${e.quality})` : ""}`).join("، "),
            empty: false,
          };
        } else {
          const amount = t === "HIFZ" ? mushaf.coverage(ranges) : ranges.reduce((n, r) => n + mushaf.length(r), 0);
          const span = ranges.length
            ? `${mushaf.formatRange({ from: ranges[0].from, to: ranges[0].from })} ← ${mushaf.formatRange({ from: ranges[ranges.length - 1].to, to: ranges[ranges.length - 1].to })}`
            : "";
          cells[t] = { text: `${amount} آية · ${list.length} مرة${span ? ` · ${span}` : ""}`, empty: false };
        }
      }
    }
    return { student, cells };
  });
}

function buildTimeline(d: ReportData, tracks: TrackKey[], mushaf: Mushaf, books: Map<string, ArabicBook>) {
  const items: { date: string; order: string; track: string; text: string }[] = [];
  for (const e of d.quran) {
    if (!tracks.includes(e.track as TrackKey)) continue;
    items.push({
      date: e.entry_date,
      order: e.created_at,
      track: TRACK_LABEL[e.track as QuranTrack],
      text: `${mushaf.formatRange(entryRange(e))}${e.quality ? ` — ${e.quality}` : ""}${e.notes ? ` — ${e.notes}` : ""}`,
    });
  }
  if (tracks.includes("ARABIC")) {
    for (const e of d.arabic) {
      items.push({
        date: e.entry_date,
        order: e.created_at,
        track: "العربية",
        text: `${books.get(e.book_id)?.title ?? ""} ص ${e.from_page}–${e.to_page}${e.quality ? ` — ${e.quality}` : ""}`,
      });
    }
  }
  if (tracks.includes("TARBIYA")) {
    for (const n of d.tarbiya) items.push({ date: n.record_date, order: "", track: "التربية", text: `${n.area}: ${n.note}` });
  }
  if (tracks.includes("ATTENDANCE")) {
    for (const a of d.attendance) items.push({ date: a.att_date, order: "", track: "الحضور", text: ATTENDANCE_LABEL[a.status as AttendanceStatus] });
  }
  return items.sort((a, b) => a.date.localeCompare(b.date) || a.order.localeCompare(b.order));
}

function buildWhatsApp(rows: Row[], tracks: { id: TrackKey; label: string }[], scope: string, period: string): string {
  let out = `📖 تقرير حلقات القرآن — ${period}\n👥 ${scope}\n👤 الطلاب: ${rows.length}\n`;
  for (const r of rows) {
    out += `\n• ${r.student.name}`;
    for (const t of tracks) {
      const c = r.cells[t.id];
      if (c && !c.empty) out += `\n   ${t.label}: ${c.text}`;
    }
    if (tracks.every((t) => r.cells[t.id]?.empty ?? true)) out += ": لم يُسجَّل";
  }
  return out;
}

// At-a-glance percentages for the selected scope/period, shown above the detailed table.
function SummaryRings({ data, studentCount }: { data: ReportData; studentCount: number }) {
  const attended = data.attendance.filter((a) => a.status === "PRESENT" || a.status === "LATE").length;
  const reciters = new Set(data.quran.map((e) => e.student_id)).size;
  const graded = data.quran.filter((e) => e.quality);
  const strong = graded.filter((e) => e.quality === "ممتاز" || e.quality === "جيد جدًا").length;
  return (
    <div className="rings">
      <ProgressRing label="نسبة الحضور" value={attended} total={data.attendance.length} />
      <ProgressRing label="طلاب سمّعوا" value={reciters} total={studentCount} color="var(--blue)" />
      <ProgressRing label="ممتاز / جيد جدًا" value={strong} total={graded.length} color="var(--gold)" />
    </div>
  );
}
