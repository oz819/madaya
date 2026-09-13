"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { Circle, Profile } from "@/lib/types";
import { GRADES } from "@/lib/types";

type StudentOption = { id: string; name: string };

export default function Daily({
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
  const [attendance, setAttendance] = useState("PRESENT");
  const [grade, setGrade] = useState("");
  const [workType, setWorkType] = useState("NEW_MEMORIZATION");
  const [surah, setSurah] = useState("");
  const [fromAyah, setFromAyah] = useState("");
  const [toAyah, setToAyah] = useState("");
  const [positive, setPositive] = useState("0");
  const [negative, setNegative] = useState("0");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const fillStudents = useCallback(async () => {
    if (!circleId) return setStudents([]);
    const { data } = await supabase.from("students").select("id,name").eq("circle_id", circleId).order("name");
    setStudents(data ?? []);
    setStudentId(data?.[0]?.id ?? "");
  }, [supabase, circleId]);

  useEffect(() => {
    fillStudents();
  }, [fillStudents]);

  async function save() {
    setError("");
    if (!studentId) return setError("اختر طالبًا");
    const adjustment = Number(positive) + Number(negative);
    const { data, error } = await supabase
      .from("daily_records")
      .insert({
        student_id: studentId,
        teacher_id: profile.id,
        attendance,
        grade: grade || null,
        work_type: workType,
        surah: surah.trim() || null,
        from_ayah: fromAyah ? Number(fromAyah) : null,
        to_ayah: toAyah ? Number(toAyah) : null,
        adjustment,
        notes: notes.trim() || null,
      })
      .select("points")
      .single();

    if (error) return setError(error.message);
    showToast(`تم الحفظ — رصيد اليوم ${data.points >= 0 ? "+" : ""}${data.points}`);
    setSurah("");
    setFromAyah("");
    setToAyah("");
    setNotes("");
  }

  return (
    <section>
      <div className="card">
        <h3>📝 التقييم اليومي</h3>
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
            <label>الحضور</label>
            <select value={attendance} onChange={(e) => setAttendance(e.target.value)}>
              <option value="PRESENT">حاضر</option>
              <option value="LATE">حاضر ومتأخر</option>
              <option value="ABSENT_EXCUSED">غائب بعذر</option>
              <option value="ABSENT">غائب بلا عذر</option>
            </select>
          </div>
          <div>
            <label>التسميع</label>
            <select value={grade} onChange={(e) => setGrade(e.target.value)}>
              {GRADES.map((g) => (
                <option key={g} value={g}>
                  {g === "" ? "لم يسمع" : g}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>نوع العمل</label>
            <select value={workType} onChange={(e) => setWorkType(e.target.value)}>
              <option value="NEW_MEMORIZATION">حفظ جديد</option>
              <option value="REVIEW">مراجعة</option>
              <option value="TILAWAH">تلاوة</option>
            </select>
          </div>
          <div>
            <label>السورة</label>
            <input value={surah} onChange={(e) => setSurah(e.target.value)} placeholder="مثال: الزخرف" />
          </div>
          <div>
            <label>من آية</label>
            <input type="number" min={1} value={fromAyah} onChange={(e) => setFromAyah(e.target.value)} />
          </div>
          <div>
            <label>إلى آية</label>
            <input type="number" min={1} value={toAyah} onChange={(e) => setToAyah(e.target.value)} />
          </div>
        </div>
        <div className="formgrid" style={{ marginTop: 10 }}>
          <div>
            <label>نقاط إيجابية إضافية</label>
            <select value={positive} onChange={(e) => setPositive(e.target.value)}>
              <option value="0">لا يوجد</option>
              <option value="1">+1 مبادرة</option>
              <option value="2">+2 تعاون/تحسن</option>
              <option value="3">+3 تميز تربوي</option>
            </select>
          </div>
          <div>
            <label>نقاط سلبية إضافية</label>
            <select value={negative} onChange={(e) => setNegative(e.target.value)}>
              <option value="0">لا يوجد</option>
              <option value="-1">−1 تقصير بسيط</option>
              <option value="-2">−2 عدم إنجاز الواجب</option>
              <option value="-3">−3 تقصير متكرر</option>
              <option value="-4">−4 سلوك مؤثر في الحلقة</option>
            </select>
          </div>
          <div style={{ gridColumn: "1/-1" }}>
            <label>ملاحظة المحفظ</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="اكتب ملاحظة تربوية مختصرة عند الحاجة..." />
          </div>
        </div>
        <button onClick={save} style={{ marginTop: 10 }}>
          حفظ التقييم
        </button>
        {error && <p className="error-text">{error}</p>}
        <div className="notice" style={{ marginTop: 12 }}>
          قاعدة مهمة: الحضور وحده لا يرفع تقييم الطالب إذا حضر بلا استعداد أو قصر في التسميع؛ يأخذ نقاط الحضور ويخسر نقاط واجب
          التسميع، مع مراعاة العذر وتقدير المحفظ.
        </div>
      </div>

      <div className="card">
        <h3>⚖️ سلم النقاط المعتمد</h3>
        <div className="two">
          <div>
            <b>إيجابي</b>
            <p className="small">حضور +2، في الوقت +1، تمكين +5، ممتاز +4، جيد جدًا +3، جيد +2، مراجعة متقنة +3، تلاوة +1.</p>
          </div>
          <div>
            <b>سلبي</b>
            <p className="small">لم يسمع بلا عذر −3، إعادة −2، غياب بلا عذر −3.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
