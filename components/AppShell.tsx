"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import type { Circle, Profile, Surah } from "@/lib/types";
import Dashboard from "@/components/sections/Dashboard";
import Students from "@/components/sections/Students";
import Daily from "@/components/sections/Daily";
import Tilawah from "@/components/sections/Tilawah";
import Edu from "@/components/sections/Edu";
import Report from "@/components/sections/Report";
import Manage from "@/components/sections/Manage";
import Toast, { useToast } from "@/components/Toast";

type Page = "dashboard" | "students" | "daily" | "tilawah" | "edu" | "report" | "manage";

const NAV: { id: Page; label: string }[] = [
  { id: "dashboard", label: "لوحة التحكم" },
  { id: "students", label: "الطلاب" },
  { id: "daily", label: "التقييم اليومي" },
  { id: "tilawah", label: "📚 متابعة التلاوة" },
  { id: "edu", label: "🌱 المتابعة التربوية" },
  { id: "report", label: "📲 التقارير" },
];

export default function AppShell() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [profile, setProfile] = useState<Profile | null>(null);
  const [disabledMessage, setDisabledMessage] = useState("");
  const [circles, setCircles] = useState<Circle[]>([]);
  const [surahs, setSurahs] = useState<Surah[]>([]);
  const [page, setPage] = useState<Page>("dashboard");
  const [ready, setReady] = useState(false);
  const { toast, showToast } = useToast();

  const refreshCircles = useCallback(async () => {
    const { data } = await supabase.from("circles").select("id,name,teacher_id").order("created_at");
    setCircles(data ?? []);
  }, [supabase]);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: p } = await supabase.from("profiles").select("id,name,role,active").eq("id", user.id).single();
      if (!p || !p.active) {
        setDisabledMessage(!p ? "لا يوجد ملف مستخدم مرتبط بهذا الحساب." : "هذا الحساب معطّل. تواصل مع المدير.");
        await supabase.auth.signOut();
        return;
      }
      setProfile(p as Profile);

      const [{ data: surahData }] = await Promise.all([
        supabase.from("quran_surahs").select("surah_no,name,ayah_count").order("surah_no"),
        refreshCircles(),
      ]);
      setSurahs(surahData ?? []);
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (disabledMessage) {
    return (
      <div className="login">
        <div className="loginbox">
          <h1>📖 حلقات القرآن</h1>
          <p className="error-text center">{disabledMessage}</p>
          <button style={{ width: "100%", marginTop: 13 }} onClick={() => router.replace("/login")}>
            العودة لتسجيل الدخول
          </button>
        </div>
      </div>
    );
  }

  if (!ready || !profile) {
    return (
      <div className="login">
        <p className="muted">جارٍ التحميل...</p>
      </div>
    );
  }

  return (
    <div>
      <header>
        <div className="headerrow">
          <div>
            <h1>📖 منظومة متابعة حلقات القرآن</h1>
            <p>متابعة علمية وتربوية متكاملة — الحفظ، المراجعة، التلاوة، الحضور والنقاط</p>
          </div>
          <div className="userbox">
            <span>
              {profile.name} — {profile.role === "ADMIN" ? "مدير" : "محفظ"}
            </span>
            <br />
            <button onClick={logout}>تسجيل الخروج</button>
          </div>
        </div>
      </header>

      <nav>
        {NAV.map((n) => (
          <button key={n.id} className={page === n.id ? "active" : ""} onClick={() => setPage(n.id)}>
            {n.label}
          </button>
        ))}
        {profile.role === "ADMIN" && (
          <button className={page === "manage" ? "active" : ""} onClick={() => setPage("manage")}>
            ⚙️ الإدارة
          </button>
        )}
      </nav>

      <main>
        {page === "dashboard" && <Dashboard supabase={supabase} circles={circles} surahs={surahs} />}
        {page === "students" && <Students supabase={supabase} circles={circles} />}
        {page === "daily" && (
          <Daily supabase={supabase} circles={circles} profile={profile} showToast={showToast} />
        )}
        {page === "tilawah" && (
          <Tilawah supabase={supabase} circles={circles} surahs={surahs} profile={profile} showToast={showToast} />
        )}
        {page === "edu" && <Edu supabase={supabase} circles={circles} profile={profile} showToast={showToast} />}
        {page === "report" && <Report supabase={supabase} circles={circles} />}
        {page === "manage" && profile.role === "ADMIN" && (
          <Manage supabase={supabase} circles={circles} refreshCircles={refreshCircles} showToast={showToast} />
        )}
      </main>

      <Toast text={toast} />
    </div>
  );
}
