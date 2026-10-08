"use client";

import { useState } from "react";
import { useApp } from "@/components/AppContext";
import { confirmDialog } from "@/components/ConfirmDialog";
import RangePicker from "@/components/RangePicker";
import { store, newId, useStore } from "@/lib/offline/store";
import type { QuranRange } from "@/lib/quran";
import { todayStr, type TalqeenSession } from "@/lib/types";

type Tick = { checked: boolean; notes: string };

// Talqeen session (spec §5.2): record a passage once for everyone present.
export default function Talqeen() {
  const s = useStore();
  const { mushaf, showToast } = useApp();
  const circles = s.all("circles").filter((c) => c.active).sort((a, b) => a.name.localeCompare(b.name, "ar"));
  const [circleId, setCircleId] = useState(circles[0]?.id ?? "");
  const [date, setDate] = useState(todayStr());
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [range, setRange] = useState<QuranRange>({ from: { surah: 1, ayah: 1 }, to: { surah: 1, ayah: 7 } });
  const [notes, setNotes] = useState("");
  const [ticks, setTicks] = useState<Record<string, Tick> | null>(null);
  const [error, setError] = useState("");

  const roster = s
    .all("students")
    .filter((st) => st.active && st.circle_id === circleId)
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));
  const sessions = s
    .all("talqeen_sessions")
    .filter((t) => !t.deleted_at && t.circle_id === circleId && t.session_date === date)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  // Pre-tick students already marked present today, unless the teacher has touched the list.
  const effectiveTicks: Record<string, Tick> =
    ticks ??
    Object.fromEntries(
      roster.map((st) => {
        const a = s.get("attendance", `${st.id}|${date}`);
        return [st.id, { checked: !!a && !a.deleted_at && (a.status === "PRESENT" || a.status === "LATE"), notes: "" }];
      })
    );

  function resetForm() {
    setSessionId(null);
    setNotes("");
    setTicks(null);
    setError("");
  }

  function openSession(t: TalqeenSession) {
    setSessionId(t.id);
    setRange({ from: { surah: t.from_surah_no, ayah: t.from_ayah }, to: { surah: t.to_surah_no, ayah: t.to_ayah } });
    setNotes(t.notes ?? "");
    const entries = s.all("quran_entries").filter((e) => e.talqeen_session_id === t.id && !e.deleted_at);
    const byStudent = new Map(entries.map((e) => [e.student_id, e]));
    setTicks(Object.fromEntries(roster.map((st) => [st.id, { checked: byStudent.has(st.id), notes: byStudent.get(st.id)?.notes ?? "" }])));
  }

  function toggle(id: string, patch: Partial<Tick>) {
    setTicks({ ...effectiveTicks, [id]: { ...effectiveTicks[id], ...patch } });
  }

  async function save() {
    const msg = mushaf.validate(range);
    if (msg) return setError(msg);
    const ticked = roster.filter((st) => effectiveTicks[st.id]?.checked);
    if (!ticked.length) return setError("اختر طالبًا واحدًا على الأقل");
    await store.saveTalqeen(
      {
        id: sessionId ?? newId(),
        circle_id: circleId,
        session_date: date,
        from_surah_no: range.from.surah,
        from_ayah: range.from.ayah,
        to_surah_no: range.to.surah,
        to_ayah: range.to.ayah,
        notes: notes.trim() || null,
      },
      ticked.map((st) => ({ student_id: st.id, notes: effectiveTicks[st.id].notes.trim() || null }))
    );
    showToast(`تم حفظ التلقين لـ ${ticked.length} طالب`);
    resetForm();
  }

  async function removeSession(t: TalqeenSession) {
    const ok = await confirmDialog({
      title: `حذف جلسة التلقين «${s.get("circles", t.circle_id)?.name ?? ""}» بتاريخ ${t.session_date}؟`,
      body: `${mushaf.formatRange({ from: { surah: t.from_surah_no, ayah: t.from_ayah }, to: { surah: t.to_surah_no, ayah: t.to_ayah } })} — تُحذف معها إدخالات التلقين للطلاب.\n` + "ينتقل إلى سجل المحذوفات، ويستطيع المدير استرجاعه من هناك.",
      ok: "حذف",
      danger: true,
    });
    if (!ok) return;
    await store.saveTalqeen({ ...t, deleted_at: new Date().toISOString() }, []);
    if (sessionId === t.id) resetForm();
    showToast("تم حذف الجلسة");
  }

  if (!circles.length) {
    return (
      <section>
        <div className="card notice">لا توجد حلقات بعد. يُنشئها المدير من شاشة الإدارة.</div>
      </section>
    );
  }

  const tickedCount = roster.filter((st) => effectiveTicks[st.id]?.checked).length;

  return (
    <section>
      <div className="card">
        <h3>🎙️ جلسة تلقين</h3>
        <div className="formgrid compact">
          <div>
            <label>الحلقة</label>
            <select
              value={circleId}
              onChange={(e) => {
                setCircleId(e.target.value);
                resetForm();
              }}
            >
              {circles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>التاريخ</label>
            <input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                resetForm();
              }}
            />
          </div>
        </div>

        {sessions.length > 0 && (
          <div className="recent" style={{ marginTop: 10 }}>
            <span className="muted">جلسات هذا اليوم:</span>
            {sessions.map((t) => (
              <span key={t.id} className={`chip ${sessionId === t.id ? "on" : ""}`}>
                <button className="link" onClick={() => openSession(t)}>
                  {mushaf.formatRange({ from: { surah: t.from_surah_no, ayah: t.from_ayah }, to: { surah: t.to_surah_no, ayah: t.to_ayah } })}
                </button>
                <button className="link danger-link" onClick={() => removeSession(t)} title="حذف">
                  ✕
                </button>
              </span>
            ))}
            {sessionId && (
              <button className="link" onClick={resetForm}>
                + جلسة جديدة
              </button>
            )}
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          <RangePicker mushaf={mushaf} value={range} onChange={setRange} />
        </div>
        <div style={{ marginTop: 8 }}>
          <label>ملاحظة الجلسة</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>

      <div className="card">
        <div className="title">
          <h3>
            الطلاب ({tickedCount}/{roster.length})
          </h3>
          <div className="row-actions">
            <button className="link" onClick={() => setTicks(Object.fromEntries(roster.map((st) => [st.id, { checked: true, notes: effectiveTicks[st.id]?.notes ?? "" }])))}>
              تحديد الكل
            </button>
            <button className="link" onClick={() => setTicks(Object.fromEntries(roster.map((st) => [st.id, { checked: false, notes: effectiveTicks[st.id]?.notes ?? "" }])))}>
              إلغاء الكل
            </button>
          </div>
        </div>
        {roster.length ? (
          <ul className="roster">
            {roster.map((st) => (
              <li key={st.id}>
                <label className="inline">
                  <input type="checkbox" checked={!!effectiveTicks[st.id]?.checked} onChange={(e) => toggle(st.id, { checked: e.target.checked })} />
                  {st.name}
                </label>
                {effectiveTicks[st.id]?.checked && (
                  <input
                    className="note-input"
                    placeholder="ملاحظة (اختياري)"
                    value={effectiveTicks[st.id].notes}
                    onChange={(e) => toggle(st.id, { notes: e.target.value })}
                  />
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">لا يوجد طلاب في هذه الحلقة.</p>
        )}
        <button onClick={save} style={{ marginTop: 10, width: "100%" }}>
          {sessionId ? "حفظ تعديل الجلسة" : "حفظ التلقين"}
        </button>
        {error && <p className="error-text">{error}</p>}
      </div>
    </section>
  );
}
