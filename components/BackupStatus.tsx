"use client";

import { useEffect, useState } from "react";

// 💾 النسخة الاحتياطية (admin dashboard): the nightly backup's last runs, read from GitHub's public
// API (the repository is public, no key needed). Warns when a day passes without a good copy.
// The copies themselves are encrypted files on the run's page («Artifacts»).

const RUNS = "https://api.github.com/repos/oz819/madaya/actions/workflows/db-backup.yml/runs?branch=main&per_page=10";
const STALE_HOURS = 30;

type Run = { status: string; conclusion: string | null; created_at: string; html_url: string };

export default function BackupStatus() {
  const [runs, setRuns] = useState<{ list: Run[]; at: number } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!navigator.onLine) return;
    let cancelled = false;
    fetch(RUNS, { headers: { Accept: "application/vnd.github+json" } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { workflow_runs?: Run[] }) => !cancelled && setRuns({ list: d.workflow_runs ?? [], at: Date.now() }))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return (
      <div className="card backup-card">
        <h3>💾 النسخة الاحتياطية</h3>
        <p className="muted">تعذّر الوصول إلى GitHub الآن لمعرفة حالة النسخ.</p>
      </div>
    );
  }
  if (!runs) return null;

  const latest = runs.list[0];
  const good = runs.list.find((r) => r.status === "completed" && r.conclusion === "success");
  const hours = good ? (runs.at - new Date(good.created_at).getTime()) / 3600000 : Infinity;
  const ok = hours <= STALE_HOURS;
  const latestFailed = latest?.status === "completed" && latest.conclusion !== "success";

  return (
    <div className={`card backup-card ${ok ? "" : "warn-card"}`}>
      <h3>
        💾 النسخة الاحتياطية <span className={`badge ${ok ? "excellent" : "redo"}`}>{ok ? "✓ تعمل" : "⚠️ تحتاج انتباه"}</span>
      </h3>
      {good ? (
        <p>
          آخر نسخة ناجحة: <b>{when(good.created_at)}</b>{" "}
          <a href={good.html_url} target="_blank" rel="noreferrer">
            تنزيلها
          </a>
        </p>
      ) : (
        <p>لا توجد نسخة ناجحة بعد.</p>
      )}
      {latestFailed && latest && (
        <p className="error-text">
          آخر محاولة فشلت ({when(latest.created_at)}).{" "}
          <a href={latest.html_url} target="_blank" rel="noreferrer">
            التفاصيل
          </a>
        </p>
      )}
      {latest?.status !== "completed" && latest && <p className="muted">نسخة قيد التنفيذ الآن…</p>}
      <p className="small muted">تُؤخذ تلقائيًا كل ليلة الساعة 3:00 وتُحفظ مشفّرة 30 يومًا. للتنزيل افتح الرابط ثم «Artifacts» أسفل الصفحة.</p>
    </div>
  );
}

function when(iso: string): string {
  const d = new Date(iso);
  const opts: Intl.DateTimeFormatOptions = { timeZone: "Asia/Damascus" };
  const day = new Intl.DateTimeFormat("ar-SY", { ...opts, weekday: "long", day: "numeric", month: "long" }).format(d);
  const time = new Intl.DateTimeFormat("ar-SY", { ...opts, hour: "numeric", minute: "2-digit" }).format(d);
  return `${day}، الساعة ${time}`;
}
