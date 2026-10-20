"use client";

import { useState } from "react";
import { useApp } from "@/components/AppContext";
import { confirmDialog } from "@/components/ConfirmDialog";
import Certificate from "@/components/Certificate";
import { newId, store } from "@/lib/offline/store";
import { useRankingSettings } from "@/lib/rankingSettings";
import { EXAM_KIND_LABEL, examTitle } from "@/lib/exams";
import { todayStr, type Exam, type ExamKind } from "@/lib/types";

// الاختبارات in the student card: record a juz' / surah / monthly exam (date, examiner, score,
// notes). Pass or fail follows the admin's pass mark. A passed juz' exam has a certificate.
export default function ExamsSection({ studentId, exams, initialJuz }: { studentId: string; exams: Exam[]; initialJuz?: number }) {
  const { mushaf, profile, supabase, showToast } = useApp();
  const { passMark } = useRankingSettings(supabase);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [kind, setKind] = useState<ExamKind>("JUZ");
  const [juz, setJuz] = useState(initialJuz ?? 30);
  const [surah, setSurah] = useState(114);
  const [date, setDate] = useState(todayStr());
  const [examiner, setExaminer] = useState(profile.name);
  const [score, setScore] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [cert, setCert] = useState<Exam | null>(null);
  const list = [...exams].filter((x) => !x.deleted_at).sort((a, b) => b.exam_date.localeCompare(a.exam_date) || b.created_at.localeCompare(a.created_at));

  function reset() {
    setEditingId(null);
    setScore("");
    setNotes("");
    setDate(todayStr());
    setError("");
  }

  function startEdit(x: Exam) {
    setEditingId(x.id);
    setKind(x.kind as ExamKind);
    if (x.juz_no) setJuz(x.juz_no);
    if (x.surah_no) setSurah(x.surah_no);
    setDate(x.exam_date);
    setExaminer(x.examiner ?? "");
    setScore(String(Number(x.score)));
    setNotes(x.notes ?? "");
  }

  async function save() {
    const n = Number(score);
    if (score.trim() === "" || !Number.isFinite(n) || n < 0 || n > 100) return setError("العلامة رقم من 0 إلى 100");
    setError("");
    const old = editingId ? exams.find((x) => x.id === editingId) : undefined;
    const row = {
      id: editingId ?? newId(),
      student_id: studentId,
      exam_date: date,
      kind,
      juz_no: kind === "JUZ" ? juz : null,
      surah_no: kind === "SURAH" ? surah : null,
      examiner: examiner.trim() || null,
      score: n,
      // An edit keeps the pass mark of the day it was recorded unless the score changed.
      passed: old && Number(old.score) === n ? old.passed : n >= passMark,
      notes: notes.trim() || null,
      deleted_at: null,
    };
    await store.save("exams", row, `${EXAM_KIND_LABEL[kind]}: ${n}`);
    showToast(row.passed ? `ناجح (${n}) ✅` : `تم الحفظ — العلامة ${n} أقل من علامة النجاح ${passMark}`);
    reset();
  }

  async function remove(x: Exam) {
    const ok = await confirmDialog({
      title: `حذف ${examTitle(x, mushaf)}؟`,
      body: `${x.exam_date} · العلامة ${Number(x.score)}`,
      ok: "حذف",
      danger: true,
    });
    if (ok) await store.softDelete("exams", x.id, "حذف اختبار");
  }

  return (
    <div className="track">
      <div className="entry-form">
        <div className="formgrid compact">
          <div>
            <label>نوع الاختبار</label>
            <select value={kind} onChange={(e) => setKind(e.target.value as ExamKind)}>
              {(["JUZ", "SURAH", "MONTHLY"] as ExamKind[]).map((k) => (
                <option key={k} value={k}>
                  {EXAM_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          {kind === "JUZ" && (
            <div>
              <label>الجزء</label>
              <select value={juz} onChange={(e) => setJuz(Number(e.target.value))} aria-label="الجزء">
                {Array.from({ length: 30 }, (_, i) => 30 - i).map((n) => (
                  <option key={n} value={n}>
                    الجزء {n}
                  </option>
                ))}
              </select>
            </div>
          )}
          {kind === "SURAH" && (
            <div>
              <label>السورة</label>
              <select value={surah} onChange={(e) => setSurah(Number(e.target.value))} aria-label="السورة">
                {mushaf.surahs.map((s) => (
                  <option key={s.surah_no} value={s.surah_no}>
                    {s.surah_no}. {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label>التاريخ</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label>المختبِر</label>
            <input value={examiner} onChange={(e) => setExaminer(e.target.value)} />
          </div>
          <div>
            <label>العلامة من 100</label>
            <input type="number" inputMode="decimal" min={0} max={100} value={score} onChange={(e) => setScore(e.target.value)} aria-label="العلامة" />
          </div>
          <div className="wide">
            <label>ملاحظات</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <div className="row-actions">
          <button onClick={save}>{editingId ? "حفظ التعديل" : "تسجيل الاختبار"}</button>
          {editingId && (
            <button className="secondary" onClick={reset}>
              إلغاء
            </button>
          )}
          <span className="muted small">علامة النجاح: {passMark}</span>
        </div>
        {error && <p className="error-text">{error}</p>}
      </div>

      {list.length ? (
        <ul className="history">
          {list.map((x) => (
            <li key={x.id} className={editingId === x.id ? "editing" : ""}>
              <div>
                <b>{examTitle(x, mushaf)}</b>
                <span className="muted"> · {x.exam_date}</span>
                <span className={`badge ${x.passed ? "excellent" : "redo"}`}>
                  {Number(x.score)} · {x.passed ? "ناجح" : "لم ينجح"}
                </span>
                {x.examiner && <div className="small muted">المختبِر: {x.examiner}</div>}
                {x.notes && <div className="small muted">{x.notes}</div>}
              </div>
              <div className="row-actions">
                {x.passed && x.kind === "JUZ" && (
                  <button className="secondary" onClick={() => setCert(x)}>
                    🎓 الشهادة
                  </button>
                )}
                <button className="link" onClick={() => startEdit(x)}>
                  تعديل
                </button>
                <button className="link danger-link" onClick={() => remove(x)}>
                  حذف
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">لا توجد اختبارات بعد.</p>
      )}
      {cert && <Certificate exam={cert} onClose={() => setCert(null)} />}
    </div>
  );
}
