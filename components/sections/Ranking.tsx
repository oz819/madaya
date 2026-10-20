"use client";

import { useState } from "react";
import { useApp } from "@/components/AppContext";
import { useScope } from "@/components/FilterBar";
import Activities from "@/components/ranking/Activities";
import SettingsForm from "@/components/ranking/SettingsForm";
import StudentProgress from "@/components/ranking/StudentProgress";
import { useRankData } from "@/components/ranking/useRankData";
import { useHistoryScope } from "@/components/ranking/useHistoryScope";
import { usePersistentState } from "@/lib/usePersistentState";
import { useStore } from "@/lib/offline/store";
import { rankingSettings, useRankingSettings } from "@/lib/rankingSettings";
import {
  ITEMS,
  PERIOD_LABEL,
  computeRanking,
  periodRange,
  weightsTotal,
  type PeriodKind,
  type Ranking as RankingResult,
  type StudentScore,
  type Weights,
} from "@/lib/ranking";
import { addDays, todayStr } from "@/lib/types";

type Tab = "ranking" | "activities" | "settings";
const MEDALS = ["🥇", "🥈", "🥉"];

// ⭐ المتفوقون: weekly and period rankings of the students in the shared filter.
export default function Ranking() {
  const [tab, setTab] = usePersistentState<Tab>("ranking.tab", "ranking");
  const { supabase } = useApp();
  const settings = useRankingSettings(supabase);

  return (
    <section>
      <div className="tabs no-print ranking-tabs">
        {(
          [
            ["ranking", "🏆 الترتيب"],
            ["activities", "🎯 الدورات والأنشطة"],
            ["settings", "⚙️ الإعدادات"],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button key={id} className={`chip ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === "ranking" && <RankingTab />}
      {tab === "activities" && <Activities />}
      {tab === "settings" && <SettingsForm settings={settings} />}
    </section>
  );
}

function RankingTab() {
  const s = useStore();
  const { supabase, mushaf, profile, showToast } = useApp();
  const settings = useRankingSettings(supabase);
  const { filter, label: filterName } = useScope();
  const admin = profile.role === "ADMIN";

  const [kind, setKind] = usePersistentState<PeriodKind>("ranking.period", "week");
  const [range, setRange] = useState({ from: addDays(todayStr(), -13), to: todayStr() });
  const [topN, setTopN] = usePersistentState<number>("ranking.top", 5);
  const [studentId, setStudentId] = useState<string | null>(null);
  // Weights being typed, and the ones the ranking uses. Admins save theirs for everyone;
  // a teacher's are a local "what if" until the page is left.
  const [draft, setDraft] = useState<Weights | null>(null);
  const [trial, setTrial] = useState<Weights | null>(null);
  const [weightError, setWeightError] = useState("");

  const today = todayStr();
  const period = periodRange(kind, today, settings, range);
  const circleId = filter.startsWith("c:") ? filter.slice(2) : null;
  const fetchFrom = period.prev ? period.prev.from : period.from;
  const history = useHistoryScope();
  // Once students have moved, a halaqa's past includes students who aren't in it now.
  const { data: fetched, partial, error } = useRankData(fetchFrom, period.to, history.moved ? null : circleId);
  const data = history.data(fetched);

  const active = s.all("students").filter((st) => st.active);
  const pool = history.pool(active, fetchFrom, period.to).sort((a, b) => a.name.localeCompare(b.name, "ar"));
  const used = { ...settings, weights: trial ?? settings.weights };
  const result = computeRanking(pool, data, used, mushaf, period.from, period.to, history.circleOn);
  const prev = period.prev ? computeRanking(pool, data, used, mushaf, period.prev.from, period.prev.to, history.circleOn) : null;
  const prevRank = new Map(prev?.ranked.map((r) => [r.student.id, r.rank!]) ?? []);
  const scopeName = filter === "all" ? "كل الطلاب" : filterName;

  const student = studentId ? pool.find((st) => st.id === studentId) : null;
  if (student) {
    return <StudentProgress student={student} pool={active} circleId={circleId} settings={used} onBack={() => setStudentId(null)} />;
  }

  const w = draft ?? trial ?? settings.weights;
  const sum = weightsTotal(w);

  async function calculate(e: React.FormEvent) {
    e.preventDefault();
    if (ITEMS.some((i) => !Number.isFinite(w[i.key]) || w[i.key] < 0)) return setWeightError("كل نسبة لازم تكون رقم من 0 لـ 100.");
    if (sum !== 100) return setWeightError(`مجموع النسب لازم يكون 100%، وهو الآن ${sum}%.`);
    setWeightError("");
    if (admin) {
      const err = await rankingSettings.save(supabase, { ...settings, weights: w });
      if (err) return setWeightError(err);
      setTrial(null);
      showToast("تم الحساب وحفظ النسب");
    } else {
      setTrial(w);
      showToast("تم الحساب بالنسب الجديدة (للتجربة فقط)");
    }
    setDraft(null);
  }

  const periodText = `${period.from} ← ${period.to > today ? today : period.to}`;
  const top = result.ranked.filter((r) => r.rank! <= topN);
  const title = kind === "week" || kind === "lastWeek" ? "متفوقو الأسبوع" : "المتفوقون";

  function whatsapp() {
    let out = `🏆 ${title} — ${scopeName}\n📅 ${PERIOD_LABEL[kind]} (${periodText})\n`;
    for (const r of top) out += `\n${MEDALS[r.rank! - 1] ?? `${r.rank}.`} ${r.student.name} — ${r.total}`;
    out += "\n\nبارك الله فيهم وجعلهم من أهل القرآن 🌿";
    navigator.clipboard?.writeText(out);
    showToast("تم نسخ الرسالة");
  }

  function csv() {
    const header = ["الترتيب", "الطالب", ...ITEMS.map((i) => i.label), "المعدل", "ملاحظة"];
    const line = (r: StudentScore) => [r.rank ? String(r.rank) : "", r.student.name, ...ITEMS.map((i) => cell(r.items[i.key])), r.total == null ? "" : String(r.total), r.reason];
    const lines = [header, ...result.ranked.map(line), ...result.unranked.map(line)];
    const body = lines.map((l) => l.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + body], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ranking-${period.from}-${period.to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <div className="card no-print">
        <h3>🏆 ترتيب المتفوقين</h3>
        <div className="formgrid compact">
          <div>
            <label>الفترة</label>
            <select value={kind} onChange={(e) => setKind(e.target.value as PeriodKind)}>
              {(Object.keys(PERIOD_LABEL) as PeriodKind[]).map((k) => (
                <option key={k} value={k}>
                  {PERIOD_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          {kind === "range" && (
            <>
              <div>
                <label>من</label>
                <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
              </div>
              <div>
                <label>إلى</label>
                <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
              </div>
            </>
          )}
          <div>
            <label>عدد المتفوقين</label>
            <select value={topN} onChange={(e) => setTopN(Number(e.target.value))}>
              <option value={3}>أول 3</option>
              <option value={5}>أول 5</option>
            </select>
          </div>
        </div>

        <form className="weights" onSubmit={calculate}>
          <h4>نسبة كل بند</h4>
          <div className="weights-grid">
            {ITEMS.map((i) => (
              <label key={i.key} className="weight">
                <span>{i.label}</span>
                <span className="weight-input">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    inputMode="numeric"
                    value={Number.isFinite(w[i.key]) ? w[i.key] : ""}
                    onChange={(e) => setDraft({ ...w, [i.key]: e.target.value === "" ? NaN : Number(e.target.value) })}
                    aria-label={`نسبة ${i.label}`}
                  />
                  %
                </span>
              </label>
            ))}
          </div>
          <div className="weights-foot">
            <span className={sum === 100 ? "pos" : "neg"}>المجموع: {Number.isFinite(sum) ? sum : "—"}%</span>
            <button type="submit">احسب</button>
            {(draft || trial) && (
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setDraft(null);
                  setTrial(null);
                  setWeightError("");
                }}
              >
                رجوع للنسب المحفوظة
              </button>
            )}
          </div>
          {weightError && <p className="error-text">{weightError}</p>}
          {!admin && <p className="muted">تقدر تجرّب نسب مختلفة وتشوف الترتيب، بس النسب المحفوظة للكل بيحددها المدير.</p>}
          {trial && <p className="muted">الترتيب الآن بنسب تجريبية غير محفوظة.</p>}
        </form>
      </div>

      {partial && <div className="notice no-print">بدون اتصال: الترتيب من بيانات هذا الجهاز فقط (آخر 60 يومًا) وقد يكون ناقصًا.</div>}
      {error && <p className="error-text">{error}</p>}
      {result.skipped.length > 0 && (
        <div className="notice no-print">
          لا توجد بيانات في هذه الفترة عن: {result.skipped.map((k) => ITEMS.find((i) => i.key === k)!.label).join("، ")}. وزنها توزّع على باقي البنود.
        </div>
      )}

      <div className="print-area">
        <div className="card star-card">
          <div className="title">
            <h3>
              🏆 {title} — {scopeName}
            </h3>
            <div className="row-actions no-print">
              <button className="secondary" onClick={whatsapp} disabled={!top.length}>
                نسخ رسالة واتساب
              </button>
              <button className="secondary" onClick={() => window.print()}>
                طباعة / PDF
              </button>
              <button className="secondary" onClick={csv}>
                CSV
              </button>
            </div>
          </div>
          <p className="muted">
            {PERIOD_LABEL[kind]} ({periodText}){prev ? " · السهم مقارنةً بالفترة السابقة" : ""}
          </p>
          {top.length ? (
            <ol className="podium">
              {top.map((r) => (
                <li key={r.student.id}>
                  <span className="medal">{MEDALS[r.rank! - 1] ?? r.rank}</span>
                  <button className="link podium-name" onClick={() => setStudentId(r.student.id)}>
                    {r.student.name}
                  </button>
                  <Move now={r.rank!} before={prev ? prevRank.get(r.student.id) : undefined} hasPrev={!!prev} />
                  <b className="podium-score">{r.total}</b>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">لا يوجد طلاب بيانات كافية في هذه الفترة بعد.</p>
          )}
        </div>

        <FullTable result={result} prevRank={prevRank} hasPrev={!!prev} onOpen={setStudentId} />
      </div>
    </>
  );
}

function cell(v: number | null): string {
  return v == null ? "—" : String(Math.round(v));
}

function Move({ now, before, hasPrev }: { now: number; before: number | undefined; hasPrev: boolean }) {
  if (!hasPrev) return null;
  if (before == null) return <span className="move new" title="لم يكن في ترتيب الفترة السابقة">جديد</span>;
  if (before === now) return <span className="move same" title="نفس الترتيب">–</span>;
  const up = before > now;
  return (
    <span className={`move ${up ? "up" : "down"}`} title={`كان ${before}`}>
      {up ? "↑" : "↓"}
      {Math.abs(before - now)}
    </span>
  );
}

function FullTable({
  result,
  prevRank,
  hasPrev,
  onOpen,
}: {
  result: RankingResult;
  prevRank: Map<string, number>;
  hasPrev: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="card">
      <h3>الترتيب الكامل</h3>
      <p className="muted no-print">كل بند من 100. اضغط على اسم الطالب لترى تقدّمه أسبوعًا بأسبوع.</p>
      <div style={{ overflow: "auto" }}>
        <table className="rank-table">
          <thead>
            <tr>
              <th>#</th>
              <th>الطالب</th>
              {ITEMS.map((i) => (
                <th key={i.key}>{i.label}</th>
              ))}
              <th>المعدل</th>
            </tr>
          </thead>
          <tbody>
            {result.ranked.map((r) => (
              <tr key={r.student.id}>
                <td>
                  <b>{r.rank}</b> <Move now={r.rank!} before={prevRank.get(r.student.id)} hasPrev={hasPrev} />
                </td>
                <td>
                  <button className="link" onClick={() => onOpen(r.student.id)}>
                    {r.student.name}
                  </button>
                </td>
                {ITEMS.map((i) => (
                  <td key={i.key} className={r.items[i.key] == null ? "muted" : ""}>
                    {cell(r.items[i.key])}
                    <div className="small muted">{detail(r, i.key)}</div>
                  </td>
                ))}
                <td>
                  <b>{r.total}</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {result.unranked.length > 0 && (
        <>
          <h4>بيانات غير كافية (خارج الترتيب)</h4>
          <ul className="history unranked">
            {result.unranked.map((r) => (
              <li key={r.student.id}>
                <button className="link" onClick={() => onOpen(r.student.id)}>
                  {r.student.name}
                </button>
                <span className="badge warn">{r.reason}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function detail(r: StudentScore, key: (typeof ITEMS)[number]["key"]): string {
  if (key === "hifz") return r.items.hifz == null ? "" : `${r.ayat} آية`;
  if (key === "attendance") return r.days ? `${r.attended}/${r.days}` : "";
  if (key === "activities") return r.activitiesTotal ? `${r.activitiesAttended}/${r.activitiesTotal}` : "";
  return "";
}
