"use client";

import { useEffect, useState } from "react";

type Request = {
  title: string;
  body?: string;
  ok: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
};

let open: ((r: Request) => void) | null = null;

/** Promise-based confirm with the app's look; resolves true only when the user confirms. */
export function confirmDialog(opts: { title: string; body?: string; ok?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    if (!open) return resolve(window.confirm(opts.title + (opts.body ? `\n\n${opts.body}` : "")));
    open({ ok: "تأكيد", ...opts, resolve });
  });
}

// Mounted once (AppShell). Escape cancels; the cancel button gets focus so Enter never deletes by accident.
export default function ConfirmDialogHost() {
  const [req, setReq] = useState<Request | null>(null);

  useEffect(() => {
    open = setReq;
    return () => {
      open = null;
    };
  }, []);

  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function close(ok: boolean) {
    req?.resolve(ok);
    setReq(null);
  }

  if (!req) return null;
  return (
    <div className="dialog-overlay" onClick={() => close(false)}>
      <div
        className={`dialog ${req.danger ? "danger" : ""}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h4 id="dialog-title">{req.title}</h4>
        {req.body && <p>{req.body}</p>}
        <div className="row-actions">
          <button className={req.danger ? "danger" : ""} onClick={() => close(true)}>
            {req.ok}
          </button>
          <button className="secondary" autoFocus onClick={() => close(false)}>
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}
