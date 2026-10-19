"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/AppContext";
import JuzGrid from "@/components/JuzGrid";
import { store, useStore } from "@/lib/offline/store";
import { entryRange, type QuranRange } from "@/lib/quran";
import { JUZ_STARTS, juzProgress, juzSpan, mergeSpans } from "@/lib/juz";
import { weekStartOf } from "@/lib/ranking";
import { useRankingSettings } from "@/lib/rankingSettings";
import { suggestReview } from "@/lib/review";
import { todayStr, type QuranEntry } from "@/lib/types";

// خريطة الحفظ: the 30 juz' coloured by what the student's hifz entries cover, how much of the
// whole Quran that is, this month's new ayat and the weekly goal (المرحلة 13). Tapping a juz
// lists its surahs. Everything comes from the hifz entries teachers already record.
export default function MemorizationMap({
  studentId,
  entries,
  onReview,
}: {
  studentId: string;
  entries: QuranEntry[];
  onReview: (r: QuranRange) => void;
}) {
  const { mushaf, supabase } = useApp();
  const s = useStore();
  const settings = useRankingSettings(supabase);
  const student = s.get("students", studentId)!;
  const [selected, setSelected] = useState<number | null>(null);
  const today = todayStr();

  const hifz = useMemo(() => entries.filter((e) => e.track === "HIFZ" && !e.deleted_at), [entries]);
  const ranges = useMemo(() => hifz.map(entryRange).filter((r): r is QuranRange => !!r), [hifz]);
  const juz = useMemo(() => juzProgress(mushaf, ranges), [mushaf, ranges]);
  const memorized = mushaf.coverage(ranges);
  const percent = mushaf.total ? Math.round((memorized / mushaf.total) * 1000) / 10 : 0;
  const month = today.slice(0, 7);
  const coverSince = (from: string) => mushaf.coverage(hifz.filter((e) => e.entry_date >= from).map(entryRange).filter((r): r is QuranRange => !!r));
  const monthAyat = coverSince(`${month}-01`);
  const weekAyat = coverSince(weekStartOf(today, settings.weekStart));
  const full = juz.filter((j) => j.percent === 100).length;

  return (
    <div className="memo-map">
      <div className="grid map-stats">
        <div className="stat">
          <span className="muted">الإنجاز من المصحف</span>
          <b>{percent}%</b>
          <span className="small muted">{memorized} آية</span>
        </div>
        <div className="stat">
          <span className="muted">حفظ هذا الشهر</span>
          <b>{monthAyat} آية</b>
        </div>
        <div className="stat">
          <span className="muted">أجزاء كاملة</span>
          <b>{full}</b>
        </div>
      </div>

      <Goal studentId={studentId} goal={student.weekly_goal_ayahs} done={weekAyat} />

      <h4>الأجزاء الثلاثون</h4>
      <JuzGrid juz={juz} selected={selected} onSelect={(n) => setSelected(selected === n ? null : n)} />
      <p className="small muted">الأخضر: محفوظ كاملًا · الملوّن جزئيًا: بدأ حفظه · اضغط على جزء لترى سوره</p>
      {selected && <JuzDetail juz={selected} ranges={ranges} />}

      <h4>🔁 مراجعة اليوم المقترحة</h4>
      <ReviewSuggestions entries={entries} onReview={onReview} />
    </div>
  );
}

function JuzDetail({ juz, ranges }: { juz: number; ranges: QuranRange[] }) {
  const { mushaf } = useApp();
  const [a, b] = juzSpan(mushaf, juz);
  const spans = mergeSpans(ranges.map((r) => [mushaf.index(r.from), mushaf.index(r.to)] as [number, number]));
  const rows: { surah: number; total: number; done: number }[] = [];
  const firstSurah = JUZ_STARTS[juz - 1].surah;
  for (const s of mushaf.surahs.filter((x) => x.surah_no >= firstSurah)) {
    const first = Math.max(a, mushaf.index({ surah: s.surah_no, ayah: 1 }));
    const last = Math.min(b, mushaf.index({ surah: s.surah_no, ayah: s.ayah_count }));
    if (first > b) break;
    if (first > last) continue;
    let done = 0;
    for (const [x, y] of spans) done += Math.max(0, Math.min(last, y) - Math.max(first, x) + 1);
    rows.push({ surah: s.surah_no, total: last - first + 1, done });
  }
  return (
    <div className="juz-detail">
      <b>الجزء {juz}</b>
      <ul>
        {rows.map((r) => (
          <li key={r.surah}>
            <span>{mushaf.name(r.surah)}</span>
            <span className={`badge ${r.done === r.total ? "excellent" : r.done ? "warn" : ""}`}>
              {r.done === r.total ? "محفوظة" : r.done ? `${r.done} من ${r.total} آية` : "لم تُحفظ"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// هدف الأسبوع: an optional number of new ayat; the bar fills with this week's hifz.
function Goal({ studentId, goal, done }: { studentId: string; goal: number | null; done: number }) {
  const { showToast } = useApp();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(goal ?? ""));

  async function save() {
    const n = value.trim() ? Number(value) : null;
    if (n !== null && (!Number.isInteger(n) || n < 1 || n > 1000)) return showToast("الهدف عدد آيات بين 1 و1000");
    const st = store.get("students", studentId)!;
    await store.save("students", { ...st, weekly_goal_ayahs: n }, n ? `هدف أسبوعي: ${n} آية` : "إلغاء الهدف الأسبوعي");
    setEditing(false);
    showToast(n ? "تم حفظ الهدف" : "تم إلغاء الهدف");
  }

  if (editing) {
    return (
      <div className="goal-box">
        <label>هدف الحفظ الأسبوعي (آيات)</label>
        <div className="inline-phone">
          <input type="number" inputMode="numeric" min={1} max={1000} value={value} onChange={(e) => setValue(e.target.value)} placeholder="مثال: 10" aria-label="هدف الحفظ الأسبوعي" />
          <button onClick={save}>حفظ</button>
          <button className="secondary" onClick={() => setEditing(false)}>
            إلغاء
          </button>
        </div>
        <p className="small muted">اتركه فارغًا لإلغاء الهدف.</p>
      </div>
    );
  }
  if (!goal) {
    return (
      <button className="link" onClick={() => setEditing(true)}>
        🎯 حدّد هدف حفظ أسبوعي لهذا الطالب
      </button>
    );
  }
  const pct = Math.min(100, Math.round((done / goal) * 100));
  return (
    <div className="goal-box">
      <div className="day-head">
        <span>
          🎯 هدف الأسبوع: <b>{Math.min(done, goal)} من {goal} آية</b>
          {done >= goal && " ✅"}
        </span>
        <button className="link" onClick={() => setEditing(true)}>
          تعديل
        </button>
      </div>
      <div className="progress">
        <i style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function ReviewSuggestions({ entries, onReview }: { entries: QuranEntry[]; onReview: (r: QuranRange) => void }) {
  const { mushaf } = useApp();
  const list = useMemo(() => suggestReview(mushaf, entries, todayStr()), [mushaf, entries]);
  if (!list.length) return <p className="muted small">لا يوجد اقتراح: لم يُسجَّل له حفظ سابق بعد، أو روجع كل حفظه مؤخرًا.</p>;
  return (
    <ul className="review-list">
      {list.map((r, i) => (
        <li key={i}>
          <div>
            <b>{mushaf.formatRange(r.range)}</b> <span className="muted small">({r.ayat} آية)</span>
            <div className="small muted">{r.reason}</div>
          </div>
          <button className="secondary" onClick={() => onReview(r.range)}>
            سجّل هذه المراجعة
          </button>
        </li>
      ))}
    </ul>
  );
}
