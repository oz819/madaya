"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { Circle, StudentRow } from "@/lib/types";

export default function Students({ supabase, circles }: { supabase: SupabaseClient<Database>; circles: Circle[] }) {
  const [circleId, setCircleId] = useState("all");
  const [search, setSearch] = useState("");
  const [students, setStudents] = useState<StudentRow[]>([]);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("list_students", circleId === "all" ? {} : { p_circle_id: circleId });
    setStudents((data ?? []) as StudentRow[]);
  }, [supabase, circleId]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = students.filter((s) => s.name.includes(search.trim()));

  return (
    <section>
      <div className="card">
        <div className="title">
          <h3>👨‍🎓 الطلاب</h3>
          <div className="two" style={{ minWidth: 330 }}>
            <select value={circleId} onChange={(e) => setCircleId(e.target.value)}>
              <option value="all">كل الحلقات</option>
              {circles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input placeholder="بحث عن طالب..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <div style={{ overflow: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>الطالب</th>
                <th>الحلقة</th>
                <th>المحفظ</th>
                <th>آخر حفظ</th>
                <th>الرصيد</th>
                <th>التقييم</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => (
                <tr key={s.id}>
                  <td>{i + 1}</td>
                  <td>
                    <b>{s.name}</b>
                  </td>
                  <td>{s.circle_name}</td>
                  <td>{s.teacher_name ?? "—"}</td>
                  <td>
                    {s.current_surah
                      ? s.current_from_ayah
                        ? `${s.current_surah} ${s.current_from_ayah}–${s.current_to_ayah}`
                        : s.current_surah
                      : "—"}
                  </td>
                  <td>{s.score}</td>
                  <td>{s.score_label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
