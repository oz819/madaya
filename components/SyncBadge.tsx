"use client";

import { useState } from "react";
import { store, useStore } from "@/lib/offline/store";

function timeAgo(iso: string | null): string {
  if (!iso) return "لم تتم بعد";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `قبل ${mins} دقيقة`;
  const h = Math.round(mins / 60);
  return h < 24 ? `قبل ${h} ساعة` : new Date(iso).toLocaleString("ar");
}

// Global sync status (spec §6.1 step 5): all synced / N waiting / M failed, with the failed list.
export default function SyncBadge() {
  const s = useStore();
  const [open, setOpen] = useState(false);
  const st = s.status;

  let cls = "ok";
  let text = "✓ كل شيء متزامن";
  if (st.failed) {
    cls = "bad";
    text = `⚠ ${st.failed} تغيير فشل`;
  } else if (st.authProblem) {
    cls = "warn";
    text = `🔒 ${st.pending} بانتظار تسجيل الدخول`;
  } else if (st.pending) {
    cls = "warn";
    text = st.online ? `⟳ ${st.pending} قيد الإرسال` : `⏸ ${st.pending} بانتظار الاتصال`;
  } else if (!st.online) {
    cls = "off";
    text = "بدون اتصال";
  } else if (st.syncing) {
    text = "⟳ مزامنة...";
  }

  return (
    <>
      <button className={`sync-badge ${cls}`} onClick={() => setOpen((o) => !o)}>
        {text}
      </button>
      {open && (
        <div className="sync-panel" role="dialog">
          <div className="title">
            <b>المزامنة</b>
            <button className="link" onClick={() => setOpen(false)}>
              إغلاق
            </button>
          </div>
          <p className="small muted">
            {st.online ? "متصل" : "بدون اتصال — التعديلات محفوظة على الجهاز وتُرسل تلقائيًا عند عودة الاتصال."}
            <br />
            آخر مزامنة: {timeAgo(st.lastSyncAt)}
          </p>
          {st.authProblem && (
            <p className="notice small">انتهت جلسة الدخول. سجّل الدخول من جديد وستُرسل التعديلات المحفوظة تلقائيًا.</p>
          )}
          {st.lastError && !st.failed && <p className="small error-text">{st.lastError}</p>}
          <button className="secondary" onClick={() => store.sync()} disabled={st.syncing || !st.online} style={{ width: "100%" }}>
            {st.syncing ? "جارٍ المزامنة..." : "مزامنة الآن"}
          </button>
          {s.outboxItems().length > 0 && (
            <ul className="outbox">
              {s.outboxItems().map((o) => (
                <li key={o.seq} className={o.status}>
                  <div>
                    <b>{o.label}</b>
                    <div className="small muted">{new Date(o.createdAt).toLocaleString("ar")}</div>
                    {o.error && <div className="small error-text">السبب: {o.error}</div>}
                  </div>
                  {o.status === "failed" && (
                    <div className="row-actions">
                      <button className="link" onClick={() => store.retry(o.seq!)}>
                        إعادة المحاولة
                      </button>
                      <button
                        className="link danger-link"
                        onClick={() => confirm("تجاهل هذا التغيير واستعادة نسخة الخادم؟") && store.discard(o.seq!)}
                      >
                        تجاهل
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
