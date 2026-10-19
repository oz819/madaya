"use client";

import { useState } from "react";
import { useApp } from "@/components/AppContext";
import { rankingSettings, useRankingSettings } from "@/lib/rankingSettings";
import { DEFAULT_ABSENCE_MESSAGE, absenceMessage } from "@/lib/familyMessages";
import type { RankingSettings } from "@/lib/ranking";

// Admin settings that aren't about the ranking: تنبيه الغياب (after how many absences, and the
// message to the family). Stored on the same settings row.
export default function CenterSettings() {
  const { supabase, showToast } = useApp();
  const settings = useRankingSettings(supabase);
  const [draft, setDraft] = useState<RankingSettings | null>(null);
  const [error, setError] = useState("");
  const v = draft ?? settings;
  const example = absenceMessage(v.absenceMessage ?? "", { name: "أحمد" } as never, v.absenceThreshold);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(v.absenceThreshold);
    if (!Number.isInteger(n) || n < 1 || n > 30) return setError("عدد أيام الغياب لازم يكون بين 1 و30");
    const msg = v.absenceMessage?.trim() || null;
    const err = await rankingSettings.save(supabase, { ...v, absenceThreshold: n, absenceMessage: msg === DEFAULT_ABSENCE_MESSAGE ? null : msg });
    if (err) return setError(err);
    setError("");
    setDraft(null);
    showToast("تم حفظ الإعدادات");
  }

  return (
    <form className="card" onSubmit={save} noValidate>
      <h3>🔔 تنبيه الغياب</h3>
      <div className="formgrid compact">
        <div>
          <label>ينبّه بعد غياب متتالٍ لمدة (أيام)</label>
          <input
            type="number"
            min={1}
            max={30}
            inputMode="numeric"
            value={Number.isFinite(v.absenceThreshold) ? v.absenceThreshold : ""}
            onChange={(e) => setDraft({ ...v, absenceThreshold: e.target.value === "" ? NaN : Number(e.target.value) })}
          />
        </div>
        <div className="wide">
          <label>رسالة الأهل</label>
          <textarea
            rows={5}
            value={v.absenceMessage ?? DEFAULT_ABSENCE_MESSAGE}
            onChange={(e) => setDraft({ ...v, absenceMessage: e.target.value })}
          />
          <p className="small muted">
            اكتب {"{الاسم}"} مكان اسم الطالب و{"{العدد}"} مكان عدد الأيام. {"{يكون}"} و{"{ه}"} تتغيّر تلقائيًا للطالبات (تكون، ـها).
          </p>
        </div>
      </div>
      <details>
        <summary className="small">مثال على الرسالة</summary>
        <pre className="msg-preview">{example}</pre>
      </details>
      <div className="row-actions" style={{ marginTop: 10 }}>
        <button type="submit" disabled={!draft}>
          حفظ
        </button>
        {draft && (
          <button type="button" className="secondary" onClick={() => setDraft(null)}>
            تراجع
          </button>
        )}
        <button type="button" className="link" onClick={() => setDraft({ ...v, absenceMessage: null })}>
          الرسالة الافتراضية
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
    </form>
  );
}
