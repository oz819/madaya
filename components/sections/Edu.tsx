"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { Circle, Profile } from "@/lib/types";
import { EDU_AREAS } from "@/lib/types";

type StudentOption = { id: string; name: string };
type EduRow = {
  id: string;
  record_date: string;
  area: string;
  points: number;
  note: string;
  students: { name: string } | null;
};

export default function Edu({
  supabase,
  circles,
  profile,
  showToast,
}: {
  supabase: SupabaseClient<Database>;
  circles: Circle[];
  profile: Profile;
  showToast: (t: string) => void;
}) {
  const [circleId, setCircleId] = useState(circles[0]?.id ?? "");
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [studentId, setStudentId] = useState("");
  const [area, setArea] = useState<string>(EDU_AREAS[0]);
  const [action, setAction] = useState("2");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [rows, setRows] = useState<EduRow[]>([]);

  useEffect(() => {
    fillStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circleId]);

  useEffect(() => {
    loadTable();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fillStudents() {
    if (!circleId) return setStudents([]);
    const { data } = await supabase.from("students").select("id,name").eq("circle_id", circleId).order("name");
    setStudents(data ?? []);
    setStudentId(data?.[0]?.id ?? "");
  }

  async function loadTable() {
    const { data } = await supabase
      .from("edu_notes")
      .select("id, record_date, area, points, note, students(name)")
      .order("record_date", { ascending: false })
      .limit(30);
    setRows((data ?? []) as unknown as EduRow[]);
  }

  async function save() {
    setError("");
    if (!studentId) return setError("اختر طالبًا");
    if (!note.trim()) return setError("اكتب الملاحظة التربوية");
    const { error } = await supabase.from("edu_notes").insert({
      student_id: studentId,
      teacher_id: profile.id,
      area,
      points: Number(action),
      note: note.trim(),
    });
    if (error) return setError(error.message);
    showToast("تم تسجيل الملاحظة التربوية");
    setNote("");
    loadTable();
  }

  return (
    <section>
      <div className="card">
        <h3>🌱 متابعة النمو التربوي</h3>
        <div className="formgrid">
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
            <label>الطالب</label>
            <select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>المجال</label>
            <select value={area} onChange={(e) => setArea(e.target.value)}>
              {EDU_AREAS.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </div>
          <div>
            <label>الإجراء</label>
            <select value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="2">إيجابي +2</option>
              <option value="1">إيجابي +1</option>
              <option value="-1">تنبيه −1</option>
              <option value="-2">تقصير −2</option>
              <option value="-3">تقصير متكرر −3</option>
            </select>
          </div>
          <div style={{ gridColumn: "1/-1" }}>
            <label>الملاحظة</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثال: بادر إلى مساعدة زميله في المراجعة." />
          </div>
        </div>
        <button onClick={save} style={{ marginTop: 10 }}>
          تسجيل الملاحظة
        </button>
        {error && <p className="error-text">{error}</p>}
        <div className="notice" style={{ marginTop: 12 }}>
          المتابعة التربوية ليست حكمًا على شخصية الطالب؛ هي ملاحظات مهنية قابلة للمراجعة تساعد المحفظ على فهم الطالب وتعزيز
          الإيجابي ومعالجة التقصير.
        </div>
      </div>

      <div className="card">
        <h3>آخر الملاحظات</h3>
        {rows.length ? (
          <table>
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>الطالب</th>
                <th>المجال</th>
                <th>النقاط</th>
                <th>الملاحظة</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.record_date.slice(0, 10)}</td>
                  <td>{r.students?.name ?? "—"}</td>
                  <td>{r.area}</td>
                  <td className={r.points > 0 ? "pos" : "neg"}>
                    {r.points > 0 ? "+" : ""}
                    {r.points}
                  </td>
                  <td>{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <span className="muted">لا توجد ملاحظات مسجلة.</span>
        )}
      </div>
    </section>
  );
}
