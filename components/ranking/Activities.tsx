"use client";

import { useState } from "react";
import { useApp } from "@/components/AppContext";
import { confirmDialog } from "@/components/ConfirmDialog";
import { useScope } from "@/components/FilterBar";
import { newId, store, useStore } from "@/lib/offline/store";
import { todayStr, type Activity } from "@/lib/types";

// الدورات والأنشطة: an activity (a course, a trip, a competition…) for one halaqa or all of them,
// and a tick for each student who attended. Works offline like the other records.
export default function Activities() {
  const s = useStore();
  const { showToast } = useApp();
  const { scopedCircles, inScope } = useScope();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayStr());
  const [circleId, setCircleId] = useState<string>(scopedCircles.length === 1 ? scopedCircles[0].id : "");
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const list = s
    .all("activities")
    .filter((a) => !a.deleted_at && (!a.circle_id || inScope(a.circle_id)))
    .sort((a, b) => b.activity_date.localeCompare(a.activity_date) || b.created_at.localeCompare(a.created_at));

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError("اكتب اسم النشاط");
    setError("");
    const id = newId();
    await store.save(
      "activities",
      { id, title: title.trim(), activity_date: date, circle_id: circleId || null, student_ids: [], deleted_at: null },
      `نشاط: ${title.trim()}`
    );
    setTitle("");
    setOpenId(id);
    showToast("تمت إضافة النشاط، حدّد من حضره");
  }

  return (
    <>
      <div className="card">
        <h3>🎯 الدورات والأنشطة</h3>
        <p className="muted">
          أضف النشاط مرة واحدة، ثم علّم الطلاب الذين حضروه. علامة الطالب في هذا البند = نسبة الأنشطة التي حضرها من أنشطة حلقته.
        </p>
        <form className="formgrid compact" onSubmit={add}>
          <div className="wide">
            <label>اسم النشاط</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: دورة أحكام التجويد" />
          </div>
          <div>
            <label>التاريخ</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label>الحلقة</label>
            <select value={circleId} onChange={(e) => setCircleId(e.target.value)}>
              <option value="">كل الحلقات</option>
              {scopedCircles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div style={{ alignSelf: "end" }}>
            <button type="submit">إضافة النشاط</button>
          </div>
        </form>
        {error && <p className="error-text">{error}</p>}
      </div>

      <div className="card">
        <h3>سجل الأنشطة</h3>
        {list.length ? (
          <ul className="history">
            {list.map((a) => (
              <ActivityRow key={a.id} activity={a} open={openId === a.id} onToggle={() => setOpenId(openId === a.id ? null : a.id)} />
            ))}
          </ul>
        ) : (
          <p className="muted">لا توجد أنشطة بعد.</p>
        )}
      </div>
    </>
  );
}

function ActivityRow({ activity: a, open, onToggle }: { activity: Activity; open: boolean; onToggle: () => void }) {
  const s = useStore();
  const { inScope } = useScope();
  const circle = a.circle_id ? s.get("circles", a.circle_id) : null;
  const students = s
    .all("students")
    .filter((st) => st.active && (a.circle_id ? st.circle_id === a.circle_id : inScope(st.circle_id)))
    .sort((x, y) => x.name.localeCompare(y.name, "ar"));
  const went = new Set(a.student_ids);

  async function setIds(ids: Set<string>, label: string) {
    await store.save("activities", { ...a, student_ids: [...ids] }, label);
  }

  function toggle(id: string) {
    const next = new Set(went);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setIds(next, `حضور نشاط: ${a.title}`);
  }

  // Who was marked present or late in their halaqa that day.
  function presentThatDay() {
    const next = new Set(went);
    for (const st of students) {
      const att = s.get("attendance", `${st.id}|${a.activity_date}`);
      if (att && !att.deleted_at && (att.status === "PRESENT" || att.status === "LATE")) next.add(st.id);
    }
    setIds(next, `حضور نشاط: ${a.title}`);
  }

  async function remove() {
    const ok = await confirmDialog({
      title: `حذف نشاط «${a.title}»؟`,
      body: `${a.activity_date} · ${circle?.name ?? "كل الحلقات"}\nلن يُحسب في ترتيب المتفوقين.`,
      ok: "حذف",
      danger: true,
    });
    if (ok) await store.softDelete("activities", a.id, "حذف نشاط");
  }

  return (
    <li className="activity-row">
      <div className="activity-head">
        <div>
          <b>{a.title}</b>
          <span className="muted">
            {" "}
            · {a.activity_date} · {circle?.name ?? "كل الحلقات"} · حضره {a.student_ids.length}
          </span>
        </div>
        <div className="row-actions">
          <button className="link" onClick={onToggle}>
            {open ? "إخفاء" : "الحضور"}
          </button>
          <button className="link danger-link" onClick={remove}>
            حذف
          </button>
        </div>
      </div>
      {open && (
        <div className="activity-roster">
          <div className="row-actions">
            <button className="secondary" onClick={presentThatDay}>
              تحديد حاضري الحلقة ذلك اليوم
            </button>
            {went.size > 0 && (
              <button className="secondary" onClick={() => setIds(new Set(), `حضور نشاط: ${a.title}`)}>
                إلغاء الكل
              </button>
            )}
          </div>
          <div className="roster-grid">
            {students.map((st) => (
              <label key={st.id} className={`chip inline ${went.has(st.id) ? "on" : ""}`}>
                <input type="checkbox" checked={went.has(st.id)} onChange={() => toggle(st.id)} />
                {st.name}
              </label>
            ))}
          </div>
        </div>
      )}
    </li>
  );
}
