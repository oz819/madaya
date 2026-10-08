"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import type { Profile, Role } from "@/lib/types";
import { Mushaf } from "@/lib/quran";
import { store, useStore } from "@/lib/offline/store";
import { getMeta, setMeta } from "@/lib/offline/idb";
import { ACCOUNT_DELETED_MESSAGE, ACCOUNT_DISABLED_MESSAGE, NOT_REGISTERED_MESSAGE } from "@/lib/messages";
import { AppContext } from "@/components/AppContext";
import Students from "@/components/sections/Students";
import Talqeen from "@/components/sections/Talqeen";
import Reports from "@/components/sections/Reports";
import Manage from "@/components/sections/Manage";
import Trash from "@/components/sections/Trash";
import ConfirmDialogHost from "@/components/ConfirmDialog";
import SyncBadge from "@/components/SyncBadge";
import SlidingIndicator from "@/components/SlidingIndicator";
import InstallHint from "@/components/InstallHint";
import Toast, { useToast } from "@/components/Toast";

type Page = "students" | "talqeen" | "reports" | "manage" | "trash";

const NAV: { id: Page; label: string }[] = [
  { id: "students", label: "👨‍🎓 الطلاب" },
  { id: "talqeen", label: "🎙️ التلقين" },
  { id: "reports", label: "📊 التقارير" },
];

type CachedProfile = { userId: string; profile: Profile };

export default function AppShell() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [profile, setProfile] = useState<Profile | null>(null);
  const [blockedMessage, setBlockedMessage] = useState("");
  const [page, setPage] = useState<Page>("students");
  const { toast, showToast } = useToast();
  const s = useStore();

  useEffect(() => {
    let started = false;
    (async () => {
      // getSession() reads the locally stored session, so the app opens offline. When online we
      // also re-check the profile on the server (role/active may have changed).
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        if (navigator.onLine) router.replace("/login");
        else setBlockedMessage("أول تسجيل دخول يحتاج اتصالًا بالإنترنت.");
        return;
      }
      const userId = session.user.id;
      const cached = await getMeta<CachedProfile>("profile");

      let p: Profile | null = cached?.userId === userId ? cached.profile : null;
      if (navigator.onLine) {
        const { data, error } = await supabase
          .from("profiles")
          .select("id,name,role,active,deleted_at")
          .eq("id", userId)
          .maybeSingle();
        if (!error) {
          if (!data || data.deleted_at || !data.active || (data.role !== "ADMIN" && data.role !== "TEACHER")) {
            setBlockedMessage(!data ? NOT_REGISTERED_MESSAGE : data.deleted_at ? ACCOUNT_DELETED_MESSAGE : ACCOUNT_DISABLED_MESSAGE);
            await supabase.auth.signOut();
            return;
          }
          p = { id: data.id, name: data.name, role: data.role as Role, active: data.active };
        }
      }
      if (!p) {
        setBlockedMessage("تعذّر التحقق من الحساب. اتصل بالإنترنت وأعد المحاولة.");
        return;
      }

      // A different account on this device: start from a clean local copy, unless the previous
      // account still has unsynced changes (those are kept and sent).
      if (cached && cached.userId !== userId) {
        await store.ensureLoaded();
        if (store.status.pending + store.status.failed === 0) await store.reset();
      }
      await setMeta("profile", { userId, profile: p } satisfies CachedProfile);
      setProfile(p);
      await store.start(supabase, userId);
      started = true;
    })();
    return () => {
      if (started) store.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deleted or disabled while the app is open: the next sync brings the change, then sign out.
  const own = profile ? s.get("profiles", profile.id) : undefined;
  const revoked = !!own && (!!own.deleted_at || !own.active);
  useEffect(() => {
    if (!revoked) return;
    setBlockedMessage(own?.deleted_at ? ACCOUNT_DELETED_MESSAGE : ACCOUNT_DISABLED_MESSAGE);
    setProfile(null);
    store.stop();
    supabase.auth.signOut();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revoked]);

  const surahs = s.all("quran_surahs");
  const mushaf = useMemo(() => new Mushaf(surahs), [surahs]);

  async function logout() {
    if (navigator.onLine) await store.sync();
    const unsent = store.status.pending + store.status.failed;
    if (unsent > 0) {
      const ok = confirm(
        `لديك ${unsent} تغيير لم يُرسل بعد إلى الخادم. تسجيل الخروج الآن يحذفها من هذا الجهاز نهائيًا.\n\nهل تريد تجاهلها وتسجيل الخروج؟`
      );
      if (!ok) return;
    }
    await store.reset();
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (blockedMessage) {
    return (
      <div className="login">
        <div className="loginbox">
          <h1>📖 حلقات القرآن</h1>
          <p className="center">{blockedMessage}</p>
          <button style={{ width: "100%", marginTop: 13 }} onClick={() => router.replace("/login")}>
            العودة لتسجيل الدخول
          </button>
        </div>
      </div>
    );
  }

  if (!profile || mushaf.total === 0) {
    return (
      <div className="login">
        <p className="muted center">
          {profile && !s.status.online
            ? "بدون اتصال: البيانات لم تُنزَّل على هذا الجهاز بعد. اتصل بالإنترنت مرة واحدة."
            : s.status.lastError
              ? `تعذّر تنزيل البيانات: ${s.status.lastError}`
              : "جارٍ التحميل..."}
        </p>
      </div>
    );
  }

  return (
    <AppContext.Provider value={{ supabase, profile, mushaf, showToast }}>
      <header className="no-print">
        <div className="headerrow">
          <div className="brand-row">
            <Image className="header-logo" src="/images/logo.png" alt="" width={46} height={46} />
            <div>
              <h1>حلقات القرآن</h1>
              <p className="dates">
                <span>
                  {greeting()} · {hijriToday()}
                </span>
                <span className="gregorian">{gregorianToday()}</span>
              </p>
            </div>
          </div>
          <div className="userbox">
            <span>
              {profile.name} — {profile.role === "ADMIN" ? "مدير" : "محفّظ"}
            </span>
            <div className="userbox-actions">
              <SyncBadge />
              <button onClick={logout}>خروج</button>
            </div>
          </div>
        </div>
      </header>

      <nav className="no-print sliding">
        <SlidingIndicator active={page} />
        {NAV.map((n) => (
          <button key={n.id} className={page === n.id ? "active" : ""} onClick={() => setPage(n.id)}>
            {n.label}
          </button>
        ))}
        {profile.role === "ADMIN" && (
          <>
            <button className={page === "manage" ? "active" : ""} onClick={() => setPage("manage")}>
              ⚙️ الإدارة
            </button>
            <button className={page === "trash" ? "active" : ""} onClick={() => setPage("trash")}>
              🗑️ سجل المحذوفات
            </button>
          </>
        )}
      </nav>

      <main>
        <div className="no-print">
          <InstallHint />
        </div>
        {page === "students" && <Students />}
        {page === "talqeen" && <Talqeen />}
        {page === "reports" && <Reports />}
        {page === "manage" && profile.role === "ADMIN" && <Manage />}
        {page === "trash" && profile.role === "ADMIN" && <Trash />}
      </main>

      <Toast text={toast} />
      <ConfirmDialogHost />
    </AppContext.Provider>
  );
}

// e.g. "الخميس، ٨ تشرين الأول ٢٠٢٦ م" — ar-SY gives the Levantine month names.
function gregorianToday(): string {
  try {
    return (
      new Intl.DateTimeFormat("ar-SY", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date()) +
      " م"
    );
  } catch {
    return "";
  }
}

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "صباح الخير" : "مساء الخير";
}

// Today's date in the Umm al-Qura Hijri calendar, e.g. "١٦ ربيع الآخر ١٤٤٨ هـ".
function hijriToday(): string {
  try {
    return new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", { day: "numeric", month: "long", year: "numeric" }).format(new Date());
  } catch {
    return "";
  }
}
