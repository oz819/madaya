"use client";

import { useState } from "react";
import { useApp } from "@/components/AppContext";
import QuranTrackSection from "@/components/card/QuranTrackSection";
import ArabicSection from "@/components/card/ArabicSection";
import TarbiyaSection from "@/components/card/TarbiyaSection";
import { store, useStore } from "@/lib/offline/store";
import { byNewest, studentProgress } from "@/lib/progress";
import { entryRange } from "@/lib/quran";
import { ATTENDANCE_LABEL, QUALITIES, todayStr, type AttendanceStatus, type QuranEntry } from "@/lib/types";

type Section = "HIFZ" | "TILAWA" | "MURAJAA" | "TALQEEN" | "ARABIC" | "TARBIYA";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "HIFZ", label: "الحفظ" },
  { id: "TILAWA", label: "التلاوة" },
  { id: "MURAJAA", label: "المراجعة" },
  { id: "TALQEEN", label: "التلقين" },
  { id: "ARABIC", label: "العربية" },
  { id: "TARBIYA", label: "التربية" },
];

const STATUSES: AttendanceStatus[] = ["PRESENT", "LATE", "EXCUSED", "ABSENT"];

export default function StudentCard({ studentId, onClose }: { studentId: string; onClose: () => void }) {
  const s = useStore();
  const { mushaf, profile, showToast } = useApp();
  const [section, setSection] = useState<Section>("HIFZ");
  const [editing, setEditing] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const student = s.get("students", studentId);
  if (!student) {
    return (
      <div className="card">
        <p className="muted">الطالب غير موجود على هذا الجهاز.</p>
        <button className="secondary" onClick={onClose}>
          رجوع
        </button>
      </div>
    );
  }

  const today = todayStr();
  const quran = s.byStudent("quran_entries").get(studentId) ?? [];
  const arabic = s.byStudent("arabic_entries").get(studentId) ?? [];
  const edu = s.byStudent("edu_notes").get(studentId) ?? [];
  const enrollments = s.byStudent("student_arabic_enrollments").get(studentId) ?? [];
  const att = s.get("attendance", `${studentId}|${today}`);
  const books = new Map(s.all("arabic_books").map((b) => [b.id, b]));
  const p = studentProgress({ mushaf, quran, arabic, enrollments, books, edu, attendanceToday: att });
  const unsynced = s.unsyncedStudents().has(studentId);
  const circle = s.get("circles", student.circle_id);
  const status = att && !att.deleted_at ? (att.status as AttendanceStatus) : null;

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      await store.fetchStudentHistory(studentId);
      showToast("تم تحميل السجل الكامل");
    } catch {
      showToast("تعذّر التحميل — تحتاج اتصالًا بالإنترنت");
    } finally {
      setLoadingHistory(false);
    }
  }

  return (
    <section>
      <div className="card student-head">
        <div className="title">
          <div>
            <button className="link" onClick={onClose}>
              → كل الطلاب
            </button>
            <h2 style={{ margin: "4px 0" }}>
              {student.name} {!student.active && <span className="badge redo">مؤرشف</span>}
            </h2>
            <span className="muted">{circle?.name ?? "—"}</span>
            {unsynced && <span className="badge warn" style={{ marginInlineStart: 8 }}>تغييرات لم تُرسل بعد</span>}
          </div>
          <button className="secondary" onClick={() => setEditing((e) => !e)}>
            {editing ? "إغلاق" : "تعديل الطالب"}
          </button>
        </div>

        {editing && <EditStudent studentId={studentId} isAdmin={profile.role === "ADMIN"} onDone={() => setEditing(false)} />}

        <div className="att-row">
          <span className="muted">حضور اليوم:</span>
          {STATUSES.map((st) => (
            <button
              key={st}
              className={status === st ? `chip on ${st.toLowerCase()}` : "chip"}
              onClick={() => store.setAttendance(studentId, today, status === st ? null : st)}
            >
              {ATTENDANCE_LABEL[st]}
            </button>
          ))}
        </div>

        <div className="positions">
          <Pos label="الحفظ" value={p.hifz ? mushaf.formatRange(p.hifz.range) : null} extra={p.hifz?.percent != null ? `${p.hifz.percent}% محفوظ` : undefined} date={p.hifz?.entry.entry_date} />
          <Pos label="التلاوة" value={p.tilawa ? mushaf.formatRange(p.tilawa.range) : null} extra={p.tilawa?.percent != null ? `${p.tilawa.percent}%` : undefined} date={p.tilawa?.entry.entry_date} />
          <Pos label="المراجعة" value={p.murajaa ? mushaf.formatRange(p.murajaa.range) : null} date={p.murajaa?.entry.entry_date} />
          <Pos label="التلقين" value={p.talqeen ? mushaf.formatRange(p.talqeen.range) : null} date={p.talqeen?.entry.entry_date} />
          <Pos label="العربية" value={p.arabic ? `${p.arabic.book.title} — ص ${p.arabic.page}` : null} extra={p.arabic ? `${p.arabic.percent}%` : undefined} />
          <Pos label="آخر ملاحظة تربوية" value={p.lastTarbiya ?? null} />
        </div>
      </div>

      <div className="tabs">
        {SECTIONS.map((sec) => (
          <button key={sec.id} className={section === sec.id ? "active" : ""} onClick={() => setSection(sec.id)}>
            {sec.label}
          </button>
        ))}
      </div>

      <div className="card">
        {(section === "HIFZ" || section === "TILAWA" || section === "MURAJAA") && (
          <QuranTrackSection key={`${studentId}-${section}`} studentId={studentId} track={section} entries={quran} />
        )}
        {section === "TALQEEN" && <TalqeenList entries={quran.filter((e) => e.track === "TALQEEN")} />}
        {section === "ARABIC" && <ArabicSection key={studentId} studentId={studentId} enrollments={enrollments} entries={arabic} />}
        {section === "TARBIYA" && <TarbiyaSection key={studentId} studentId={studentId} notes={edu} />}
        <div style={{ marginTop: 12 }}>
          <button className="link" onClick={loadHistory} disabled={loadingHistory}>
            {loadingHistory ? "جارٍ التحميل..." : "تحميل السجل الأقدم من الخادم"}
          </button>
        </div>
      </div>
    </section>
  );
}

function Pos({ label, value, extra, date }: { label: string; value: string | null; extra?: string; date?: string }) {
  return (
    <div className="pos-tile">
      <span className="muted">{label}</span>
      <b>{value ?? "—"}</b>
      {(extra || date) && (
        <span className="small muted">
          {extra}
          {extra && date ? " · " : ""}
          {date}
        </span>
      )}
    </div>
  );
}

function TalqeenList({ entries }: { entries: QuranEntry[] }) {
  const { mushaf, showToast } = useApp();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [quality, setQuality] = useState("");
  const [notes, setNotes] = useState("");
  const list = [...entries].sort(byNewest((e) => e.entry_date));

  if (!list.length) return <p className="muted">لا توجد جلسات تلقين لهذا الطالب. تُسجَّل من شاشة «التلقين».</p>;

  return (
    <ul className="history">
      {list.map((e) => (
        <li key={e.id} className={editingId === e.id ? "editing" : ""}>
          <div style={{ flex: 1 }}>
            <b>{mushaf.formatRange(entryRange(e))}</b>
            <span className="muted"> · {e.entry_date}</span>
            {e.quality && <span className="badge">{e.quality}</span>}
            {e.notes && <div className="small muted">{e.notes}</div>}
            {editingId === e.id && (
              <div className="formgrid compact" style={{ marginTop: 8 }}>
                <select value={quality} onChange={(ev) => setQuality(ev.target.value)}>
                  <option value="">—</option>
                  {QUALITIES.map((q) => (
                    <option key={q}>{q}</option>
                  ))}
                </select>
                <input value={notes} placeholder="ملاحظة" onChange={(ev) => setNotes(ev.target.value)} />
                <button
                  onClick={async () => {
                    await store.save("quran_entries", { ...e, quality: quality || null, notes: notes.trim() || null }, "تعديل تلقين");
                    setEditingId(null);
                    showToast("تم التعديل");
                  }}
                >
                  حفظ
                </button>
              </div>
            )}
          </div>
          <div className="row-actions">
            <button
              className="link"
              onClick={() => {
                setEditingId(e.id);
                setQuality(e.quality ?? "");
                setNotes(e.notes ?? "");
              }}
            >
              تعديل
            </button>
            <button
              className="link danger-link"
              onClick={async () => {
                if (confirm("حذف هذا الإدخال؟")) await store.softDelete("quran_entries", e.id, "حذف تلقين");
              }}
            >
              حذف
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function EditStudent({ studentId, isAdmin, onDone }: { studentId: string; isAdmin: boolean; onDone: () => void }) {
  const s = useStore();
  const { showToast } = useApp();
  const student = s.get("students", studentId)!;
  const [name, setName] = useState(student.name);
  const [circleId, setCircleId] = useState(student.circle_id);
  const circles = s.all("circles").filter((c) => c.active || c.id === student.circle_id);

  async function save() {
    if (!name.trim()) return;
    await store.save("students", { ...student, name: name.trim(), circle_id: circleId }, "تعديل بيانات طالب");
    showToast("تم حفظ بيانات الطالب");
    onDone();
  }

  async function toggleArchive() {
    if (!confirm(student.active ? "أرشفة هذا الطالب؟" : "إلغاء أرشفة الطالب؟")) return;
    await store.save("students", { ...student, active: !student.active }, student.active ? "أرشفة طالب" : "إلغاء أرشفة طالب");
    onDone();
  }

  return (
    <div className="formgrid compact" style={{ margin: "10px 0" }}>
      <div>
        <label>الاسم</label>
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
      <div className="row-actions" style={{ alignSelf: "end" }}>
        <button onClick={save}>حفظ</button>
        {isAdmin && (
          <button className="secondary" onClick={toggleArchive}>
            {student.active ? "أرشفة" : "إلغاء الأرشفة"}
          </button>
        )}
      </div>
    </div>
  );
}
