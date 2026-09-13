"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { Circle, StudentRow, Surah } from "@/lib/types";
import { tilawahPercent, todayStr } from "@/lib/types";

type TilawahSummaryRow = { name: string; surah: string; from: number; to: number; pct: number };

export default function Dashboard({
  supabase,
  circles,
  surahs,
}: {
  supabase: SupabaseClient<Database>;
  circles: Circle[];
  surahs: Surah[];
}) {
  const [circleId, setCircleId] = useState("all");
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [presentToday, setPresentToday] = useState(0);
  const [heardToday, setHeardToday] = useState(0);
  const [eduPos, setEduPos] = useState(0);
  const [eduNeg, setEduNeg] = useState(0);
  const [tilawahSummary, setTilawahSummary] = useState<TilawahSummaryRow[]>([]);

  const load = useCallback(async () => {
    const { data: rows } = await supabase.rpc("list_students", circleId === "all" ? {} : { p_circle_id: circleId });
    const list = ((rows ?? []) as StudentRow[]).slice().sort((a, b) => b.rank_value - a.rank_value);
    setStudents(list);

    const ids = list.map((s) => s.id);
    const today = todayStr();

    if (ids.length === 0) {
      setPresentToday(0);
      setHeardToday(0);
      setEduPos(0);
      setEduNeg(0);
      setTilawahSummary([]);
      return;
    }

    const [{ data: daily }, { data: edu }, { data: til }] = await Promise.all([
      supabase.from("daily_records").select("student_id,attendance,grade").eq("record_date", today).in("student_id", ids),
      supabase.from("edu_notes").select("points,student_id").eq("record_date", today).in("student_id", ids),
      supabase
        .from("tilawah_records")
        .select("student_id, surah, from_ayah, to_ayah, surah_no, record_date, students(name)")
        .in("student_id", ids)
        .order("record_date", { ascending: false }),
    ]);

    const presentSet = new Set((daily ?? []).filter((r) => r.attendance === "PRESENT" || r.attendance === "LATE").map((r) => r.student_id));
    const heardSet = new Set((daily ?? []).filter((r) => r.grade).map((r) => r.student_id));
    setPresentToday(presentSet.size);
    setHeardToday(heardSet.size);
    setEduPos((edu ?? []).filter((r) => r.points > 0).length);
    setEduNeg((edu ?? []).filter((r) => r.points < 0).length);

    const seen = new Set<string>();
    const summary: TilawahSummaryRow[] = [];
    for (const r of til ?? []) {
      if (seen.has(r.student_id)) continue;
      seen.add(r.student_id);
      const studentName = (r.students as unknown as { name: string } | null)?.name ?? "—";
      summary.push({
        name: studentName,
        surah: r.surah,
        from: r.from_ayah,
        to: r.to_ayah,
        pct: tilawahPercent(surahs, r.surah_no, r.to_ayah),
      });
    }
    summary.sort((a, b) => b.pct - a.pct);
    setTilawahSummary(summary.slice(0, 8));
  }, [supabase, circleId, surahs]);

  useEffect(() => {
    load();
  }, [load]);

  const needAttention = students.filter((s) => s.score < 60).length;

  return (
    <section>
      <div className="grid">
        <div className="card stat">
          <span className="muted">إجمالي الطلاب</span>
          <b>{students.length}</b>
        </div>
        <div className="card stat">
          <span className="muted">حاضرون اليوم</span>
          <b>{presentToday}</b>
        </div>
        <div className="card stat">
          <span className="muted">سمّعوا اليوم</span>
          <b>{heardToday}</b>
        </div>
        <div className="card stat">
          <span className="muted">يحتاجون متابعة</span>
          <b>{needAttention}</b>
        </div>
      </div>

      <div className="card">
        <div className="title">
          <h3>🌱 مؤشرات تربوية اليوم</h3>
          <span className="muted">تساعد المحفظ على اتخاذ القرار</span>
        </div>
        <div className="grid">
          <div className="pill">🌟 ملاحظات إيجابية: <b>{eduPos}</b></div>
          <div className="pill">⚠️ ملاحظات تحتاج معالجة: <b>{eduNeg}</b></div>
          <div className="pill">🔴 طلاب أقل من 60: <b>{needAttention}</b></div>
        </div>
      </div>

      <div className="card">
        <div className="title">
          <h3>🏆 مسار التقدم في الحفظ</h3>
          <select value={circleId} onChange={(e) => setCircleId(e.target.value)}>
            <option value="all">كل الحلقات</option>
            {circles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>الطالب</th>
              <th>الحلقة</th>
              <th>موضع الحفظ</th>
              <th>الرصيد</th>
              <th>التقييم</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s, i) => (
              <tr key={s.id}>
                <td className="rank">{i + 1}</td>
                <td>
                  <b>{s.name}</b>
                </td>
                <td>{s.circle_name}</td>
                <td className="pos">
                  {s.current_surah ? `${s.current_surah}${s.current_from_ayah ? ` ${s.current_from_ayah}–${s.current_to_ayah}` : ""}` : "—"}
                </td>
                <td>{s.score}</td>
                <td>
                  <span className={`badge ${s.score >= 80 ? "excellent" : s.score < 60 ? "redo" : "good"}`}>{s.score_label}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="title">
          <h3>📚 التلاوة</h3>
          <span className="muted">مسار مستقل من الفاتحة إلى الناس</span>
        </div>
        {tilawahSummary.length ? (
          <table>
            <thead>
              <tr>
                <th>الطالب</th>
                <th>آخر موضع</th>
                <th>التقدم</th>
              </tr>
            </thead>
            <tbody>
              {tilawahSummary.map((t, i) => (
                <tr key={i}>
                  <td>{t.name}</td>
                  <td>
                    {t.surah} {t.from}–{t.to}
                  </td>
                  <td>{t.pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <span className="muted">لم تسجل متابعة تلاوة بعد.</span>
        )}
      </div>
    </section>
  );
}
