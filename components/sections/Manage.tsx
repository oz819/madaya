"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { Circle } from "@/lib/types";

type Teacher = { id: string; name: string; active: boolean };

export default function Manage({
  supabase,
  circles,
  refreshCircles,
  showToast,
}: {
  supabase: SupabaseClient<Database>;
  circles: Circle[];
  refreshCircles: () => Promise<void>;
  showToast: (t: string) => void;
}) {
  const [teachers, setTeachers] = useState<Teacher[]>([]);

  const [teacherName, setTeacherName] = useState("");
  const [teacherEmail, setTeacherEmail] = useState("");
  const [teacherPassword, setTeacherPassword] = useState("");
  const [teacherError, setTeacherError] = useState("");

  const [circleName, setCircleName] = useState("");
  const [circleTeacher, setCircleTeacher] = useState("");
  const [circleError, setCircleError] = useState("");

  const [studentName, setStudentName] = useState("");
  const [studentCircle, setStudentCircle] = useState(circles[0]?.id ?? "");
  const [studentError, setStudentError] = useState("");

  useEffect(() => {
    loadTeachers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadTeachers() {
    const { data } = await supabase.from("profiles").select("id,name,active").eq("role", "TEACHER").order("created_at");
    setTeachers(data ?? []);
  }

  async function addTeacher() {
    setTeacherError("");
    const res = await fetch("/api/admin/teachers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: teacherName.trim(), email: teacherEmail.trim(), password: teacherPassword }),
    });
    const data = await res.json();
    if (!res.ok) return setTeacherError(data.error || "تعذّر إضافة المحفظ");
    setTeacherName("");
    setTeacherEmail("");
    setTeacherPassword("");
    await loadTeachers();
    showToast("تمت إضافة المحفظ");
  }

  async function toggleActive(id: string, active: boolean) {
    const { error } = await supabase.from("profiles").update({ active }).eq("id", id);
    if (error) return setTeacherError(error.message);
    await loadTeachers();
  }

  async function addCircle() {
    setCircleError("");
    const name = circleName.trim();
    if (!name) return setCircleError("أدخل اسم الحلقة");
    const { error } = await supabase.from("circles").insert({ name, teacher_id: circleTeacher || null });
    if (error) return setCircleError(error.message);
    setCircleName("");
    await refreshCircles();
    showToast("تم إنشاء الحلقة");
  }

  async function reassignCircle(circleId: string, teacherId: string) {
    const { error } = await supabase.from("circles").update({ teacher_id: teacherId || null }).eq("id", circleId);
    if (error) return setCircleError(error.message);
    await refreshCircles();
    showToast("تم تحديث الحلقة");
  }

  async function addStudent() {
    setStudentError("");
    const name = studentName.trim();
    if (!name || !studentCircle) return setStudentError("أكمل بيانات الطالب");
    const { error } = await supabase.from("students").insert({ name, circle_id: studentCircle });
    if (error) return setStudentError(error.message);
    setStudentName("");
    showToast("تمت إضافة الطالب");
  }

  return (
    <section>
      <div className="card">
        <h3>⚙️ إدارة النظام — المدير</h3>
        <div className="notice">
          صلاحيات المدير: إدارة المحفظين، إنشاء الحلقات، توزيع الطلاب على الحلقات، ومراجعة جميع البيانات. المحفظ يرى حلقاته
          فقط.
        </div>
      </div>

      <div className="card">
        <h3>👥 المحفظون</h3>
        <div className="formgrid">
          <input placeholder="اسم المحفظ" value={teacherName} onChange={(e) => setTeacherName(e.target.value)} />
          <input placeholder="البريد الإلكتروني" type="email" value={teacherEmail} onChange={(e) => setTeacherEmail(e.target.value)} />
          <input
            placeholder="كلمة المرور (8 أحرف+)"
            type="password"
            value={teacherPassword}
            onChange={(e) => setTeacherPassword(e.target.value)}
          />
        </div>
        <button style={{ marginTop: 10 }} onClick={addTeacher}>
          إضافة محفظ
        </button>
        {teacherError && <p className="error-text">{teacherError}</p>}
        <div style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th>المحفظ</th>
                <th>الحالة</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {teachers.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td>{t.active ? "مفعّل" : "معطّل"}</td>
                  <td>
                    <button className="secondary" onClick={() => toggleActive(t.id, !t.active)}>
                      {t.active ? "تعطيل" : "تفعيل"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3>🏫 الحلقات</h3>
        <div className="formgrid">
          <input placeholder="اسم الحلقة" value={circleName} onChange={(e) => setCircleName(e.target.value)} />
          <select value={circleTeacher} onChange={(e) => setCircleTeacher(e.target.value)}>
            <option value="">بلا محفظ</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <button style={{ marginTop: 10 }} onClick={addCircle}>
          إضافة حلقة
        </button>
        {circleError && <p className="error-text">{circleError}</p>}
        <div style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th>الحلقة</th>
                <th>المحفظ</th>
              </tr>
            </thead>
            <tbody>
              {circles.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>
                    <select value={c.teacher_id ?? ""} onChange={(e) => reassignCircle(c.id, e.target.value)}>
                      <option value="">بلا محفظ</option>
                      {teachers.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3>👨‍🎓 إضافة طالب</h3>
        <div className="formgrid">
          <input placeholder="اسم الطالب" value={studentName} onChange={(e) => setStudentName(e.target.value)} />
          <select value={studentCircle} onChange={(e) => setStudentCircle(e.target.value)}>
            {circles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <button style={{ marginTop: 10 }} onClick={addStudent}>
          إضافة طالب
        </button>
        {studentError && <p className="error-text">{studentError}</p>}
      </div>
    </section>
  );
}
