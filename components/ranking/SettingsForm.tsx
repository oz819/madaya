"use client";

import { useState } from "react";
import { useApp } from "@/components/AppContext";
import { rankingSettings } from "@/lib/rankingSettings";
import { WEEK_DAYS, type RankingSettings } from "@/lib/ranking";
import { QUALITIES } from "@/lib/types";

// What each grade is worth, the first day of the week and when the course started.
// Admins edit; teachers see the values in use.
export default function SettingsForm({ settings }: { settings: RankingSettings }) {
  const { supabase, profile, showToast } = useApp();
  const admin = profile.role === "ADMIN";
  const [draft, setDraft] = useState<RankingSettings | null>(null);
  const [error, setError] = useState("");
  const v = draft ?? settings;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    for (const q of QUALITIES) {
      const n = Number(v.grades[q]);
      if (!Number.isFinite(n) || n < 0 || n > 100) return setError(`قيمة «${q}» لازم تكون بين 0 و100`);
    }
    const err = await rankingSettings.save(supabase, v);
    if (err) return setError(err);
    setError("");
    setDraft(null);
    showToast("تم حفظ الإعدادات");
  }

  return (
    <form className="card" onSubmit={save}>
      <h3>⚙️ إعدادات الترتيب</h3>
      {!admin && <p className="muted">هذه الإعدادات يعدّلها المدير.</p>}
      <h4>قيمة كل تقدير من 100</h4>
      <div className="formgrid compact">
        {QUALITIES.map((q) => (
          <div key={q}>
            <label>{q}</label>
            <input
              type="number"
              min={0}
              max={100}
              inputMode="numeric"
              disabled={!admin}
              value={v.grades[q] ?? ""}
              onChange={(e) => setDraft({ ...v, grades: { ...v.grades, [q]: e.target.value === "" ? NaN : Number(e.target.value) } })}
            />
          </div>
        ))}
      </div>
      <h4>الأسبوع والدورة</h4>
      <div className="formgrid compact">
        <div>
          <label>أول يوم في الأسبوع</label>
          <select disabled={!admin} value={v.weekStart} onChange={(e) => setDraft({ ...v, weekStart: Number(e.target.value) })}>
            {[6, 0, 1, 2, 3, 4, 5].map((d) => (
              <option key={d} value={d}>
                {WEEK_DAYS[d]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>بداية الدورة</label>
          <input
            type="date"
            disabled={!admin}
            value={v.courseStart ?? ""}
            onChange={(e) => setDraft({ ...v, courseStart: e.target.value || null })}
          />
        </div>
      </div>
      {admin && (
        <div className="row-actions" style={{ marginTop: 12 }}>
          <button type="submit" disabled={!draft}>
            حفظ الإعدادات
          </button>
          {draft && (
            <button type="button" className="secondary" onClick={() => setDraft(null)}>
              تراجع
            </button>
          )}
        </div>
      )}
      {error && <p className="error-text">{error}</p>}
    </form>
  );
}
