"use client";

import { useState } from "react";
import { useApp } from "@/components/AppContext";
import RangePicker from "@/components/RangePicker";
import { entryRange, type Mushaf, type QuranRange } from "@/lib/quran";
import { byNewest, latestOfTrack } from "@/lib/progress";
import { store, newId } from "@/lib/offline/store";
import { QUALITIES, TRACK_LABEL, todayStr, type QuranEntry, type QuranTrack } from "@/lib/types";

/** Prefill from the last entry (spec §5.1): hifz/tilawa continue after it, muraja'a repeats it. */
function suggest(mushaf: Mushaf, track: QuranTrack, last: QuranEntry | undefined): QuranRange {
  const r = last ? entryRange(last) : null;
  if (!r) return { from: { surah: 1, ayah: 1 }, to: { surah: 1, ayah: mushaf.ayahCount(1) || 7 } };
  if (track === "MURAJAA") return r;
  const next = mushaf.next(r.to) ?? r.to;
  return { from: next, to: next };
}

export default function QuranTrackSection({
  studentId,
  track,
  entries,
}: {
  studentId: string;
  track: Exclude<QuranTrack, "TALQEEN">;
  entries: QuranEntry[];
}) {
  const { mushaf, showToast, profile } = useApp();
  const mine = entries.filter((e) => e.track === track).sort(byNewest((e) => e.entry_date));
  const last = latestOfTrack(entries, track);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [range, setRange] = useState<QuranRange>(() => suggest(mushaf, track, last));
  const [date, setDate] = useState(todayStr());
  const [quality, setQuality] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);

  function reset(prefillFrom?: QuranEntry) {
    setEditingId(null);
    setRange(suggest(mushaf, track, prefillFrom ?? last));
    setDate(todayStr());
    setQuality("");
    setNotes("");
    setError("");
  }

  function startEdit(e: QuranEntry) {
    const r = entryRange(e);
    setEditingId(e.id);
    if (r) setRange(r);
    setDate(e.entry_date);
    setQuality(e.quality ?? "");
    setNotes(e.notes ?? "");
    setError("");
  }

  async function save() {
    const msg = mushaf.validate(range);
    if (msg) return setError(msg);
    const saved = await store.save(
      "quran_entries",
      {
        id: editingId ?? newId(),
        student_id: studentId,
        entry_date: date,
        track,
        from_surah_no: range.from.surah,
        from_ayah: range.from.ayah,
        to_surah_no: range.to.surah,
        to_ayah: range.to.ayah,
        quality: quality || null,
        notes: notes.trim() || null,
        talqeen_session_id: null,
        deleted_at: null,
      },
      `${TRACK_LABEL[track]}: ${mushaf.formatRange(range)}`
    );
    if (!editingId) await store.ensurePresent(studentId, date);
    showToast(editingId ? "تم تعديل الإدخال" : `تم حفظ ${TRACK_LABEL[track]}`);
    reset(saved);
  }

  async function remove(e: QuranEntry) {
    if (!confirm("حذف هذا الإدخال؟")) return;
    await store.softDelete("quran_entries", e.id, `حذف ${TRACK_LABEL[track]}`);
    if (editingId === e.id) reset();
    showToast("تم الحذف");
  }

  const visible = showAll ? mine : mine.slice(0, 5);

  return (
    <div className="track">
      <div className="entry-form">
        <RangePicker mushaf={mushaf} value={range} onChange={setRange} />
        <div className="formgrid compact">
          <div>
            <label>التاريخ</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label>التقدير</label>
            <select value={quality} onChange={(e) => setQuality(e.target.value)}>
              <option value="">—</option>
              {QUALITIES.map((q) => (
                <option key={q}>{q}</option>
              ))}
            </select>
          </div>
          <div className="wide">
            <label>ملاحظة</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <div className="row-actions">
          <button onClick={save}>{editingId ? "حفظ التعديل" : `إضافة ${TRACK_LABEL[track]}`}</button>
          {editingId && (
            <button className="secondary" onClick={() => reset()}>
              إلغاء
            </button>
          )}
          <span className="muted">{mushaf.length(range) > 0 && `${mushaf.length(range)} آية`}</span>
        </div>
        {error && <p className="error-text">{error}</p>}
      </div>

      {mine.length ? (
        <ul className="history">
          {visible.map((e) => (
            <li key={e.id} className={editingId === e.id ? "editing" : ""}>
              <div>
                <b>{mushaf.formatRange(entryRange(e))}</b>
                <span className="muted"> · {e.entry_date}</span>
                {e.quality && <span className="badge">{e.quality}</span>}
                {e.notes && <div className="small muted">{e.notes}</div>}
                {e.teacher_id && e.teacher_id !== profile.id && (
                  <div className="small muted">سجّله: {store.get("profiles", e.teacher_id)?.name ?? "—"}</div>
                )}
              </div>
              <div className="row-actions">
                <button className="link" onClick={() => startEdit(e)}>
                  تعديل
                </button>
                <button className="link danger-link" onClick={() => remove(e)}>
                  حذف
                </button>
              </div>
            </li>
          ))}
          {mine.length > 5 && (
            <li>
              <button className="link" onClick={() => setShowAll((s) => !s)}>
                {showAll ? "عرض أقل" : `عرض الكل (${mine.length})`}
              </button>
            </li>
          )}
        </ul>
      ) : (
        <p className="muted">لا توجد إدخالات بعد.</p>
      )}
    </div>
  );
}
