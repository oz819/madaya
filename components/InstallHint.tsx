"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void> };

const DISMISS_KEY = "installHintDismissed";

// Teachers must install the app to the home screen: it keeps working offline and iOS is far less
// likely to evict its stored data (spec §6.3).
export default function InstallHint() {
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    } catch {}
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    setShow(!standalone && !dismissed);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!show) return null;

  function dismiss() {
    setShow(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  }

  return (
    <div className="notice install-hint">
      <b>📲 ثبّت التطبيق على الشاشة الرئيسية</b> ليعمل بدون إنترنت وتبقى بياناتك محفوظة على الجهاز.
      <div className="small" style={{ marginTop: 6 }}>
        {ios ? (
          <>في Safari: اضغط زر المشاركة ⬆️ ثم «إضافة إلى الشاشة الرئيسية».</>
        ) : deferred ? (
          <button
            onClick={async () => {
              await deferred.prompt();
              setDeferred(null);
              dismiss();
            }}
          >
            تثبيت الآن
          </button>
        ) : (
          <>من قائمة المتصفح ⋮ اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».</>
        )}
        <button className="link" onClick={dismiss} style={{ marginInlineStart: 10 }}>
          لاحقًا
        </button>
      </div>
    </div>
  );
}
