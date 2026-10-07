"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/AppContext";
import StudentCard from "@/components/StudentCard";
import { matchesName } from "@/lib/arabic";
import { store, newId, useStore } from "@/lib/offline/store";
import { latestOfTrack } from "@/lib/progress";
import { entryRange } from "@/lib/quran";
import { ATTENDANCE_LABEL, todayStr, type AttendanceStatus } from "@/lib/types";

const RECENT_KEY = "recentStudents";

function readRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

// The teacher's main screen (spec §5.1): call up whichever student is sitting in front of them.
export default function Students() {
  const s = useStore();
  const { mushaf, showToast, profile } = useApp();
  const [query, setQuery] = useState("");
  const [circleId, setCircleId] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);

  useEffect(() => setRecent(readRecent()), []);

  function open(id: string) {
    setOpenId(id);
    const next = [id, ...recent.filter((r) => r !== id)].slice(0, 6);
    setRecent(next);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {}
    window.scrollTo({ top: 0 });
  }

  if (openId) return <StudentCard studentId={openId} onClose={() => setOpenId(null)} />;

  const today = todayStr();
  const circles = s.all("circles").filter((c) => c.active).sort((a, b) => a.name.localeCompare(b.name, "ar"));
  const quranBy = s.byStudent("quran_entries");
  const unsynced = s.unsyncedStudents();
  const students = s
    .all("students")
    .filter((st) => (showArchived ? !st.active : st.active))
    .filter((st) => circleId === "all" || st.circle_id === circleId)
    .filter((st) => matchesName(st.name, query))
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));

  const active = s.all("students").filter((st) => st.active);
  const presentToday = active.filter((st) => {
    const a = s.get("attendance", `${st.id}|${today}`);
    return a && !a.deleted_at && (a.status === "PRESENT" || a.status === "LATE");
  }).length;
  const recordedToday = active.filter((st) => (quranBy.get(st.id) ?? []).some((e) => e.entry_date === today)).length;
  const recentStudents = recent.map((id) => s.get("students", id)).filter((st) => st && st.active);

  return (
    <section>
      <div className="grid">
        <div className="card stat">
          <span className="muted">الطلاب</span>
          <b>{active.length}</b>
        </div>
        <div className="card stat">
          <span className="muted">حاضرون اليوم</span>
          <b>{presentToday}</b>
        </div>
        <div className="card stat">
          <span className="muted">سُجّل لهم اليوم</span>
          <b>{recordedToday}</b>
        </div>
      </div>

      <div className="card">
        <div className="title">
          <h3>👨‍🎓 الطلاب</h3>
          <button onClick={() => setAdding((a) => !a)}>{adding ? "إغلاق" : "+ إضافة طالب"}</button>
        </div>
        {adding && (
          <AddStudent
            onAdded={(id) => {
              setAdding(false);
              showToast("تمت إضافة الطالب");
              open(id);
            }}
          />
        )}
        <div className="search-row">
          <input type="search" placeholder="ابحث باسم الطالب..." value={query} onChange={(e) => setQuery(e.target.value)} />
          <select value={circleId} onChange={(e) => setCircleId(e.target.value)}>
            <option value="all">كل الحلقات</option>
            {circles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {profile.role === "ADMIN" && (
          <label className="inline">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> عرض المؤرشفين
          </label>
        )}

        {!query && recentStudents.length > 0 && (
          <div className="recent">
            <span className="muted">فُتحوا مؤخرًا:</span>
            {recentStudents.map((st) => (
              <button key={st!.id} className="chip" onClick={() => open(st!.id)}>
                {st!.name}
              </button>
            ))}
          </div>
        )}

        {!s.status.initialSyncDone && !students.length ? (
          <p className="muted">جارٍ تنزيل البيانات لأول مرة... (يحتاج اتصالًا بالإنترنت)</p>
        ) : students.length ? (
          <ul className="student-list">
            {students.map((st) => {
              const hifz = latestOfTrack(quranBy.get(st.id), "HIFZ");
              const att = s.get("attendance", `${st.id}|${today}`);
              const status = att && !att.deleted_at ? (att.status as AttendanceStatus) : null;
              return (
                <li key={st.id} onClick={() => open(st.id)}>
                  <div>
                    <b>{st.name}</b>
                    {unsynced.has(st.id) && <span className="dot" title="تغييرات لم تُرسل" />}
                    <div className="small muted">
                      {s.get("circles", st.circle_id)?.name ?? "—"}
                      {hifz && ` · حفظ: ${mushaf.formatRange(entryRange(hifz))}`}
                    </div>
                  </div>
                  {status && (
                    <span className={`badge ${status === "ABSENT" ? "redo" : status === "EXCUSED" ? "warn" : "excellent"}`}>
                      {ATTENDANCE_LABEL[status]}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="muted">لا يوجد طلاب مطابقون.</p>
        )}
      </div>
    </section>
  );
}

function AddStudent({ onAdded }: { onAdded: (id: string) => void }) {
  const s = useStore();
  const circles = s.all("circles").filter((c) => c.active);
  const books = s.all("arabic_books").filter((b) => b.active);
  const [name, setName] = useState("");
  const [circleId, setCircleId] = useState(circles[0]?.id ?? "");
  const [bookId, setBookId] = useState("");
  const [error, setError] = useState("");

  async function add() {
    if (!name.trim() || !circleId) return setError("أدخل الاسم واختر الحلقة");
    const id = newId();
    await store.save("students", { id, name: name.trim(), circle_id: circleId, active: true }, `إضافة طالب: ${name.trim()}`);
    if (bookId) {
      await store.save(
        "student_arabic_enrollments",
        { id: newId(), student_id: id, book_id: bookId, started_on: todayStr(), finished_on: null, deleted_at: null },
        "تسجيل في كتاب عربية"
      );
    }
    onAdded(id);
  }

  if (!circles.length) return <p className="notice">لا توجد حلقات بعد. يُنشئها المدير من شاشة الإدارة.</p>;

  return (
    <div className="formgrid compact" style={{ margin: "10px 0" }}>
      <div>
        <label>اسم الطالب</label>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
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
      <div>
        <label>كتاب العربية (اختياري)</label>
        <select value={bookId} onChange={(e) => setBookId(e.target.value)}>
          <option value="">بدون</option>
          {books.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
            </option>
          ))}
        </select>
      </div>
      <div style={{ alignSelf: "end" }}>
        <button onClick={add}>حفظ الطالب</button>
      </div>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
