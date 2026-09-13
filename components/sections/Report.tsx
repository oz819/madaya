"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { Circle, StudentRow } from "@/lib/types";
import { WORK_TYPE_LABEL, todayStr } from "@/lib/types";

type DailyToday = {
  student_id: string;
  work_type: string;
  surah: string | null;
  from_ayah: number | null;
  to_ayah: number | null;
  grade: string | null;
  points: number;
};

export default function Report({ supabase, circles }: { supabase: SupabaseClient<Database>; circles: Circle[] }) {
  const [circleId, setCircleId] = useState("all");
  const [text, setText] = useState("");

  const build = useCallback(async () => {
    const { data: rows } = await supabase.rpc("list_students", circleId === "all" ? {} : { p_circle_id: circleId });
    const students = (rows ?? []) as StudentRow[];
    const today = todayStr();

    const ids = students.map((s) => s.id);
    let daily: DailyToday[] = [];
    if (ids.length) {
      const { data } = await supabase
        .from("daily_records")
        .select("student_id, work_type, surah, from_ayah, to_ayah, grade, points, created_at")
        .eq("record_date", today)
        .in("student_id", ids)
        .order("created_at", { ascending: false });
      daily = data ?? [];
    }

    const latestByStudent = new Map<string, DailyToday>();
    for (const r of daily) if (!latestByStudent.has(r.student_id)) latestByStudent.set(r.student_id, r);

    const circleLabel = circleId === "all" ? "جميع الحلقات" : circles.find((c) => c.id === circleId)?.name || "—";

    let out = `📖 تقرير حلقة القرآن — ${today}\n\n`;
    out += `👥 الحلقة: ${circleLabel}\n`;
    out += `👤 الطلاب: ${students.length}\n\n`;
    out += "📚 الحفظ والمراجعة والتلاوة:\n";
    out += students
      .map((s) => {
        const r = latestByStudent.get(s.id);
        if (!r) return `• ${s.name}: لم يسجل اليوم`;
        const position = r.surah ? `${r.surah} ${r.from_ayah || ""}–${r.to_ayah || ""}` : "لم يحدد الموضع";
        return `• ${s.name}: ${WORK_TYPE_LABEL[r.work_type]} — ${position} — ${r.grade || "لم يسمع"} — نقاط ${r.points >= 0 ? "+" : ""}${r.points}`;
      })
      .join("\n");
    out += "\n\n🌱 الرصيد التربوي الشهري:\n";
    out += students.map((s) => `• ${s.name}: ${s.score}/100 — ${s.score_label}`).join("\n");

    setText(out);
  }, [supabase, circleId, circles]);

  useEffect(() => {
    build();
  }, [build]);

  function copy() {
    navigator.clipboard?.writeText(text);
  }

  return (
    <section>
      <div className="card">
        <div className="title">
          <h3>📲 تقارير واتساب</h3>
          <select value={circleId} onChange={(e) => setCircleId(e.target.value)}>
            <option value="all">كل الحلقات</option>
            {circles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", lineHeight: 1.9 }}>{text}</pre>
        <button className="secondary" onClick={copy}>
          نسخ التقرير
        </button>
      </div>
    </section>
  );
}
