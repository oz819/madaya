"use client";

import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/components/AppContext";
import { useStore } from "@/lib/offline/store";
import { SECTION_LABEL, type Section } from "@/lib/filter";
import { EXAM_KIND_LABEL } from "@/lib/exams";
import { ATTENDANCE_LABEL, TRACK_LABEL, localDateStr, type AttendanceStatus, type ExamKind, type QuranTrack } from "@/lib/types";
import type { Tables } from "@/lib/supabase/database.types";

type Row = Tables<"audit_log">;
const PAGE = 50;

const TABLE_LABEL: Record<string, string> = {
  students: "طالب",
  circles: "حلقة",
  profiles: "حساب",
  quran_entries: "تسميع",
  attendance: "حضور",
  arabic_books: "كتاب عربية",
  student_arabic_enrollments: "كتاب الطالب",
  arabic_entries: "درس عربية",
  edu_notes: "تربية وسلوك",
  talqeen_sessions: "جلسة تلقين",
  circle_lessons: "درس اليوم",
  activities: "نشاط",
  exams: "اختبار",
  ranking_settings: "الإعدادات",
};

const ACTION: Record<string, { label: string; cls: string }> = {
  INSERT: { label: "إضافة", cls: "excellent" },
  UPDATE: { label: "تعديل", cls: "good" },
  DELETE: { label: "حذف", cls: "redo" },
  RESTORE: { label: "استرجاع", cls: "" },
};

const FIELD_LABEL: Record<string, string> = {
  name: "الاسم",
  circle_id: "الحلقة",
  student_id: "الطالب",
  active: "الحالة",
  section: "القسم",
  role: "الصلاحية",
  default_filter: "الفرز الافتراضي",
  guardian_name: "ولي الأمر",
  guardian_phone: "رقم ولي الأمر",
  weekly_goal_ayahs: "الهدف الأسبوعي",
  entry_date: "التاريخ",
  att_date: "التاريخ",
  record_date: "التاريخ",
  lesson_date: "التاريخ",
  activity_date: "التاريخ",
  exam_date: "التاريخ",
  session_date: "التاريخ",
  started_on: "بدأ",
  finished_on: "أنهى",
  track: "النوع",
  from_surah_no: "من سورة",
  from_ayah: "من آية",
  to_surah_no: "إلى سورة",
  to_ayah: "إلى آية",
  quality: "التقدير",
  notes: "ملاحظات",
  note: "الملاحظة",
  status: "الحضور",
  title: "العنوان",
  total_pages: "عدد الصفحات",
  book_id: "الكتاب",
  from_page: "من صفحة",
  to_page: "إلى صفحة",
  area: "المجال",
  points: "النقاط",
  kind: "النوع",
  juz_no: "الجزء",
  surah_no: "السورة",
  examiner: "المختبِر",
  score: "العلامة",
  passed: "النتيجة",
  student_ids: "الطلاب",
  weights: "نسب البنود",
  grades: "علامات التقديرات",
  week_start: "بداية الأسبوع",
  course_start: "بداية الدورة",
  absence_threshold: "أيام تنبيه الغياب",
  absence_message: "رسالة الغياب",
  pass_mark: "علامة النجاح",
  deleted_at: "محذوف",
};
// Identifiers that say nothing to a person.
const HIDDEN = new Set(["id", "talqeen_session_id"]);

// سجل التعديلات (admin): who added, changed, deleted or restored what, and when. Recorded by the
// database itself from the moment it was turned on. Online only.
export default function AuditLog() {
  const s = useStore();
  const { supabase, mushaf } = useApp();
  const [rows, setRows] = useState<Row[]>([]);
  const [more, setMore] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [actor, setActor] = useState("");
  const [table, setTable] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const staff = s.all("profiles").sort((a, b) => a.name.localeCompare(b.name, "ar"));

  const load = useCallback(
    async (offset: number) => {
      setError("");
      if (!navigator.onLine) return setError("سجل التعديلات يحتاج اتصالًا بالإنترنت");
      setBusy(true);
      let q = supabase.from("audit_log").select("*").order("at", { ascending: false }).order("id", { ascending: false });
      if (actor) q = q.eq("actor", actor);
      if (table) q = q.eq("table_name", table);
      if (from) q = q.gte("at", new Date(`${from}T00:00:00`).toISOString());
      if (to) q = q.lte("at", new Date(`${to}T23:59:59.999`).toISOString());
      const { data, error } = await q.range(offset, offset + PAGE - 1);
      setBusy(false);
      if (error) return setError(error.message);
      setRows((prev) => (offset ? [...prev, ...(data ?? [])] : (data ?? [])));
      setMore((data ?? []).length === PAGE);
    },
    [supabase, actor, table, from, to]
  );
  useEffect(() => {
    load(0);
  }, [load]);

  const val = (field: string, v: unknown): string => {
    if (v === null || v === undefined || v === "") return "—";
    if (field === "student_id") return s.get("students", String(v))?.name ?? "طالب محذوف";
    if (field === "circle_id") return s.get("circles", String(v))?.name ?? "—";
    if (field === "book_id") return s.get("arabic_books", String(v))?.title ?? "—";
    if (field === "from_surah_no" || field === "to_surah_no" || field === "surah_no") return mushaf.name(Number(v));
    if (field === "track") return TRACK_LABEL[v as QuranTrack] ?? String(v);
    if (field === "status") return ATTENDANCE_LABEL[v as AttendanceStatus] ?? String(v);
    if (field === "section") return SECTION_LABEL[v as Section] ?? String(v);
    if (field === "kind") return EXAM_KIND_LABEL[v as ExamKind] ?? String(v);
    if (field === "role") return v === "ADMIN" ? "مدير" : "محفّظ";
    if (field === "active") return v ? "نشط" : "مؤرشف/موقوف";
    if (field === "passed") return v ? "ناجح" : "لم ينجح";
    if (field === "deleted_at") return "نعم";
    if (field === "guardian_phone") return `+${v}`;
    if (field === "student_ids" && Array.isArray(v)) return `${v.length} طلاب`;
    if (typeof v === "object") return JSON.stringify(v).replace(/[{}"]/g, "").replace(/,/g, "، ");
    return String(v);
  };

  // What the row is about: the student, or the halaqa/book/account/settings it names.
  const subject = (r: Row): string => {
    const c = (r.changes ?? {}) as Record<string, unknown>;
    const pick = (k: string) => (Array.isArray(c[k]) ? (c[k] as unknown[])[1] ?? (c[k] as unknown[])[0] : c[k]);
    if (r.student_id) return s.get("students", r.student_id)?.name ?? (typeof pick("name") === "string" ? String(pick("name")) : "طالب محذوف");
    if (r.table_name === "circles") return s.get("circles", r.row_key)?.name ?? String(pick("name") ?? "");
    if (r.table_name === "profiles") return s.get("profiles", r.row_key)?.name ?? String(pick("name") ?? "");
    if (r.table_name === "arabic_books") return s.get("arabic_books", r.row_key)?.title ?? String(pick("title") ?? "");
    if (r.table_name === "circle_lessons") return s.get("circles", r.row_key.split("|")[0])?.name ?? "";
    if (r.table_name === "talqeen_sessions" || r.table_name === "activities") return val("circle_id", pick("circle_id"));
    if (r.table_name === "ranking_settings") return "إعدادات المركز";
    return "";
  };

  const lines = (r: Row): string[] => {
    const c = (r.changes ?? {}) as Record<string, unknown>;
    const keys = Object.keys(c).filter((k) => !HIDDEN.has(k) && !(r.table_name === "students" && k === "name" && r.action === "INSERT"));
    if (r.action === "UPDATE" || r.action === "RESTORE") {
      return keys
        .filter((k) => k !== "deleted_at")
        .map((k) => {
          const [a, b] = c[k] as [unknown, unknown];
          return `${FIELD_LABEL[k] ?? k}: ${val(k, a)} ← ${val(k, b)}`;
        });
    }
    if (r.action === "DELETE" && "deleted_at" in c && keys.length === 1) return [];
    // A whole new (or purged) row: one line, so a day of entries stays short on a phone.
    const all = keys.filter((k) => k !== "student_id" && k !== "deleted_at").map((k) => `${FIELD_LABEL[k] ?? k}: ${val(k, c[k])}`);
    return all.length ? [all.join("، ")] : [];
  };

  return (
    <section>
      <div className="card audit">
        <h3>📜 سجل التعديلات</h3>
        <p className="small muted">كل إضافة وتعديل وحذف على البيانات: مَن ومتى وماذا تغيّر. السجل يبدأ من يوم تفعيله.</p>
        <div className="audit-filters">
          <select aria-label="المستخدم" value={actor} onChange={(e) => setActor(e.target.value)}>
            <option value="">كل المستخدمين</option>
            {staff.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select aria-label="نوع البيانات" value={table} onChange={(e) => setTable(e.target.value)}>
            <option value="">كل البيانات</option>
            {Object.entries(TABLE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <label>
            من
            <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            إلى
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
        {error && <p className="error-text">{error}</p>}
        {!busy && !error && !rows.length && <p className="muted">لا توجد تعديلات بهذا الفرز.</p>}
        <ul className="audit-list">
          {rows.map((r) => {
            const a = ACTION[r.action] ?? { label: r.action, cls: "" };
            const ls = lines(r);
            return (
              <li key={r.id}>
                <div className="audit-head">
                  <span className={`badge ${a.cls}`}>{a.label}</span>
                  <b>
                    {TABLE_LABEL[r.table_name] ?? r.table_name}
                    {subject(r) ? ` · ${subject(r)}` : ""}
                  </b>
                </div>
                {ls.length > 0 && (
                  <ul className="audit-changes">
                    {ls.map((l, i) => (
                      <li key={i}>{l}</li>
                    ))}
                  </ul>
                )}
                <div className="muted">
                  {(r.actor && s.get("profiles", r.actor)?.name) || "النظام"} · {when(r.at)}
                </div>
              </li>
            );
          })}
        </ul>
        {more && (
          <button className="secondary" disabled={busy} onClick={() => load(rows.length)}>
            {busy ? "جارٍ التحميل..." : "عرض المزيد"}
          </button>
        )}
      </div>
    </section>
  );
}

function when(iso: string): string {
  const d = new Date(iso);
  const day = localDateStr(d);
  const time = new Intl.DateTimeFormat("ar-SY", { hour: "numeric", minute: "2-digit" }).format(d);
  return `${new Intl.DateTimeFormat("ar-SY", { weekday: "long", day: "numeric", month: "long" }).format(d)}${day === localDateStr(new Date()) ? " (اليوم)" : ""} · ${time}`;
}
