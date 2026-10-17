"use client";

import { useState } from "react";
import { useApp } from "@/components/AppContext";
import { confirmDialog } from "@/components/ConfirmDialog";
import { usePersistentState } from "@/lib/usePersistentState";
import { store, useStore } from "@/lib/offline/store";
import { todayStr, type Circle } from "@/lib/types";

// درس اليوم: written once per halaqa per day, and shown in the report of every student who
// attended that day. Offers the halaqat the shared filter covers.
export default function LessonCard({ circles }: { circles: Circle[] }) {
  const s = useStore();
  const { showToast } = useApp();
  const [savedCid, setCid] = usePersistentState("lesson.circle", "");
  const cid = circles.some((c) => c.id === savedCid) ? savedCid : (circles[0]?.id ?? "");
  const [date, setDate] = useState(todayStr());
  const [draft, setDraft] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [error, setError] = useState("");

  if (!cid) return null;
  const key = `${cid}|${date}`;
  const row = s.get("circle_lessons", key);
  const lesson = row && !row.deleted_at ? row : undefined;
  const editing = draft !== null || !lesson;
  const text = draft ?? "";
  const circleName = s.get("circles", cid)?.name ?? "";
  const present = s
    .all("students")
    .filter((st) => st.active && st.circle_id === cid)
    .filter((st) => {
      const a = s.get("attendance", `${st.id}|${date}`);
      return a && !a.deleted_at && (a.status === "PRESENT" || a.status === "LATE");
    }).length;
  const log = s
    .all("circle_lessons")
    .filter((l) => l.circle_id === cid && !l.deleted_at)
    .sort((a, b) => b.lesson_date.localeCompare(a.lesson_date));

  function pick(next: { cid?: string; date?: string }) {
    if (next.cid !== undefined) setCid(next.cid);
    if (next.date !== undefined) setDate(next.date);
    setDraft(null);
    setError("");
  }

  async function save() {
    const title = text.trim();
    if (!title) return setError("اكتب عنوان الدرس");
    await store.save("circle_lessons", { circle_id: cid, lesson_date: date, title, deleted_at: null }, `درس اليوم: ${title}`);
    setDraft(null);
    setError("");
    showToast("تم حفظ الدرس");
  }

  async function remove() {
    if (!lesson) return;
    const ok = await confirmDialog({
      title: `حذف درس «${lesson.title}»؟`,
      body: `${circleName} · ${date}\nلن يظهر في تقارير الطلاب لهذا اليوم.`,
      ok: "حذف",
      danger: true,
    });
    if (!ok) return;
    await store.softDelete("circle_lessons", key, "حذف درس اليوم");
    setDraft(null);
    showToast("تم حذف الدرس");
  }

  return (
    <div className="card lesson-card">
      <div className="title">
        <h3>📚 {date === todayStr() ? "درس اليوم" : "الدرس"}</h3>
        <button className="link" onClick={() => setShowLog((v) => !v)}>
          {showLog ? "إخفاء السجل" : `سجل الدروس (${log.length})`}
        </button>
      </div>
      <div className="formgrid compact">
        {circles.length > 1 && (
          <div>
            <label>الحلقة</label>
            <select value={cid} onChange={(e) => pick({ cid: e.target.value })}>
              {circles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label>التاريخ</label>
          <input type="date" value={date} max={todayStr()} onChange={(e) => e.target.value && pick({ date: e.target.value })} />
        </div>
      </div>

      {editing ? (
        <div className="lesson-edit">
          <input
            value={text}
            placeholder="مثال: أحكام الوضوء"
            aria-label="عنوان الدرس"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
          />
          <div className="row-actions">
            <button onClick={save}>حفظ الدرس</button>
            {lesson && (
              <button className="secondary" onClick={() => setDraft(null)}>
                إلغاء
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="lesson-show">
          <b>{lesson!.title}</b>
          <div className="row-actions">
            <button className="link" onClick={() => setDraft(lesson!.title)}>
              تعديل
            </button>
            <button className="link danger-link" onClick={remove}>
              حذف
            </button>
          </div>
        </div>
      )}
      {error && <p className="error-text">{error}</p>}
      <p className="small muted">
        يُكتب مرة واحدة للحلقة، ويظهر في تقرير كل طالب حاضر بهذا اليوم{present ? ` (الحاضرون الآن: ${present})` : ""}.
      </p>

      {showLog &&
        (log.length ? (
          <ul className="history">
            {log.map((l) => (
              <li key={l.lesson_date} className={l.lesson_date === date ? "editing" : ""}>
                <div>
                  <b>{l.title}</b>
                  <span className="muted"> · {l.lesson_date}</span>
                </div>
                <button className="link" onClick={() => pick({ date: l.lesson_date })}>
                  فتح
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">لا توجد دروس مسجّلة لهذه الحلقة بعد.</p>
        ))}
    </div>
  );
}
