"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { Circle, Profile, Surah } from "@/lib/types";
import { TILAWAH_GRADES, tilawahPercent } from "@/lib/types";

type StudentOption = { id: string; name: string };
type TilawahRow = {
  id: string;
  student_id: string;
  surah: string;
  surah_no: number;
  from_ayah: number;
  to_ayah: number;
  grade: string;
  record_date: string;
  students: { name: string } | null;
};

export default function Tilawah({
  supabase,
  circles,
  surahs,
  profile,
  showToast,
}: {
  supabase: SupabaseClient<Database>;
  circles: Circle[];
  surahs: Surah[];
  profile: Profile;
  showToast: (t: string) => void;
}) {
  const [circleId, setCircleId] = useState(circles[0]?.id ?? "");
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [studentId, setStudentId] = useState("");
  const [surahNo, setSurahNo] = useState(1);
  const [fromAyah, setFromAyah] = useState(1);
  const [toAyah, setToAyah] = useState(1);
  const [grade, setGrade] = useState<string>(TILAWAH_GRADES[0]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [rows, setRows] = useState<TilawahRow[]>([]);

  const fillStudents = useCallback(async () => {
    if (!circleId) return setStudents([]);
    const { data } = await supabase.from("students").select("id,name").eq("circle_id", circleId).order("name");
    setStudents(data ?? []);
    setStudentId(data?.[0]?.id ?? "");
  }, [supabase, circleId]);

  const loadTable = useCallback(async () => {
    if (!circleId) return setRows([]);
    const { data } = await supabase
      .from("tilawah_records")
      .select("id, student_id, surah, surah_no, from_ayah, to_ayah, grade, record_date, students!inner(name, circle_id)")
      .eq("students.circle_id", circleId)
      .order("record_date", { ascending: false });
    setRows((data ?? []) as unknown as TilawahRow[]);
  }, [supabase, circleId]);

  useEffect(() => {
    fillStudents();
    loadTable();
  }, [fillStudents, loadTable]);

  function handleSurahChange(no: number) {
    setSurahNo(no);
    const max = surahs.find((s) => s.surah_no === no)?.ayah_count || 1;
    setFromAyah((f) => Math.min(f || 1, max));
    setToAyah((t) => Math.min(t || max, max));
  }

  async function save() {
    setError("");
    if (!studentId) return setError("اختر طالبًا");
    const { error } = await supabase.from("tilawah_records").insert({
      student_id: studentId,
      teacher_id: profile.id,
      surah_no: surahNo,
      surah: "",
      from_ayah: fromAyah,
      to_ayah: toAyah,
      grade,
      notes: notes.trim() || null,
    });
    if (error) return setError(error.message);
    showToast("تم تسجيل متابعة التلاوة");
    setNotes("");
    loadTable();
  }

  const latestByStudent = new Map<string, TilawahRow>();
  for (const r of rows) if (!latestByStudent.has(r.student_id)) latestByStudent.set(r.student_id, r);
  const latest = Array.from(latestByStudent.values()).sort(
    (a, b) => tilawahPercent(surahs, b.surah_no, b.to_ayah) - tilawahPercent(surahs, a.surah_no, a.to_ayah)
  );

  return (
    <section>
      <div className="card">
        <div className="title">
          <h3>📚 متابعة التلاوة</h3>
          <span className="muted">الفاتحة ← الناس</span>
        </div>
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
            <label>السورة</label>
            <select value={surahNo} onChange={(e) => handleSurahChange(Number(e.target.value))}>
              {surahs.map((s) => (
                <option key={s.surah_no} value={s.surah_no}>
                  {s.surah_no}. {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>من آية</label>
            <input type="number" min={1} value={fromAyah} onChange={(e) => setFromAyah(Number(e.target.value))} />
          </div>
          <div>
            <label>إلى آية</label>
            <input type="number" min={1} value={toAyah} onChange={(e) => setToAyah(Number(e.target.value))} />
          </div>
          <div>
            <label>التقييم</label>
            <select value={grade} onChange={(e) => setGrade(e.target.value)}>
              {TILAWAH_GRADES.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </div>
          <div style={{ gridColumn: "1/-1" }}>
            <label>ملاحظات</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="مثال: ضبط مخارج الحروف يحتاج مزيدًا من التدريب" />
          </div>
        </div>
        <button onClick={save} style={{ marginTop: 10 }}>
          حفظ متابعة التلاوة
        </button>
        {error && <p className="error-text">{error}</p>}
      </div>

      <div className="card">
        <h3>📈 تقدم التلاوة حسب الحلقة</h3>
        {latest.length ? (
          <table>
            <thead>
              <tr>
                <th>الطالب</th>
                <th>آخر موضع</th>
                <th>التقدم</th>
                <th>آخر تاريخ</th>
                <th>التقييم</th>
              </tr>
            </thead>
            <tbody>
              {latest.map((r) => {
                const pct = tilawahPercent(surahs, r.surah_no, r.to_ayah);
                return (
                  <tr key={r.id}>
                    <td>
                      <b>{r.students?.name}</b>
                    </td>
                    <td>
                      {r.surah} {r.from_ayah}–{r.to_ayah}
                    </td>
                    <td>
                      <div className="progress">
                        <i style={{ width: `${pct}%` }} />
                      </div>
                      <span className="small">{pct}%</span>
                    </td>
                    <td>{r.record_date.slice(0, 10)}</td>
                    <td>{r.grade}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <span className="muted">لا توجد سجلات تلاوة بعد.</span>
        )}
      </div>
    </section>
  );
}
