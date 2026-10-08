"use client";

import { useState } from "react";
import { useApp } from "@/components/AppContext";
import { confirmDialog } from "@/components/ConfirmDialog";
import { store, newId } from "@/lib/offline/store";
import { byNewest } from "@/lib/progress";
import { EDU_AREAS, todayStr, type EduNote } from "@/lib/types";

// Tarbiya track: behavioural notes. edu_notes.points is grading and stays hidden (spec §10).
export default function TarbiyaSection({ studentId, notes }: { studentId: string; notes: EduNote[] }) {
  const { showToast } = useApp();
  const list = [...notes].sort(byNewest((n) => n.record_date));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [area, setArea] = useState<string>(EDU_AREAS[0]);
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayStr());
  const [error, setError] = useState("");

  function reset() {
    setEditingId(null);
    setNote("");
    setDate(todayStr());
    setError("");
  }

  async function save() {
    if (!note.trim()) return setError("اكتب الملاحظة");
    await store.save(
      "edu_notes",
      { id: editingId ?? newId(), student_id: studentId, area, note: note.trim(), record_date: date, deleted_at: null },
      `ملاحظة تربوية: ${area}`
    );
    showToast(editingId ? "تم التعديل" : "تم تسجيل الملاحظة");
    reset();
  }

  async function remove(n: EduNote) {
    const who = store.get("students", studentId)?.name ?? "";
    const ok = await confirmDialog({
      title: `حذف الملاحظة التربوية «${n.area}» لـ ${who}؟`,
      body: `${n.record_date} · ${n.note}\n` + "ينتقل إلى سجل المحذوفات، ويستطيع المدير استرجاعه من هناك.",
      ok: "حذف",
      danger: true,
    });
    if (!ok) return;
    await store.softDelete("edu_notes", n.id, "حذف ملاحظة تربوية");
  }

  return (
    <div className="track">
      <div className="entry-form">
        <div className="formgrid compact">
          <div>
            <label>المجال</label>
            <select value={area} onChange={(e) => setArea(e.target.value)}>
              {EDU_AREAS.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </div>
          <div>
            <label>التاريخ</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="wide">
            <label>الملاحظة</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثال: بادر إلى مساعدة زميله في المراجعة." />
          </div>
        </div>
        <div className="row-actions">
          <button onClick={save}>{editingId ? "حفظ التعديل" : "إضافة ملاحظة"}</button>
          {editingId && (
            <button className="secondary" onClick={reset}>
              إلغاء
            </button>
          )}
        </div>
        {error && <p className="error-text">{error}</p>}
      </div>
      {list.length ? (
        <ul className="history">
          {list.slice(0, 8).map((n) => (
            <li key={n.id}>
              <div>
                <b>{n.area}</b>
                <span className="muted"> · {n.record_date}</span>
                <div className="small">{n.note}</div>
              </div>
              <div className="row-actions">
                <button
                  className="link"
                  onClick={() => {
                    setEditingId(n.id);
                    setArea(n.area);
                    setNote(n.note);
                    setDate(n.record_date);
                  }}
                >
                  تعديل
                </button>
                <button className="link danger-link" onClick={() => remove(n)}>
                  حذف
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">لا توجد ملاحظات بعد.</p>
      )}
    </div>
  );
}
