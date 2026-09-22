"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) {
      // Only a real "wrong email/password" response gets the friendly message. Anything else
      // (network failure, misconfigured Supabase URL/key, server error...) is a setup problem,
      // not a credentials problem — say so distinctly instead of silently misleading the user.
      setError(
        error.code === "invalid_credentials"
          ? "بيانات الدخول غير صحيحة"
          : `تعذّر الاتصال بالخادم (${error.code ?? error.status ?? "خطأ غير معروف"}). راجع الإعداد أو تواصل مع المدير.`
      );
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <div className="login">
      <div className="loginbox">
        <h1>📖 حلقات القرآن</h1>
        <p className="center muted">منظومة متابعة الحفظ والمراجعة والتلاوة والنمو التربوي</p>

        <div className="dedication">
          <p className="dedication-title">🤍 عن روح المرحوم زيد سيف الدين</p>
          <p className="dedication-dua">اللهم اجعل هذا العمل صدقةً جاريةً عنه، واجزه عن القرآن وأهله خير الجزاء.</p>
        </div>

        <form onSubmit={login} style={{ marginTop: 18 }}>
          <label>البريد الإلكتروني</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            autoComplete="email"
          />
          <label style={{ marginTop: 9 }}>كلمة المرور</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          <button type="submit" style={{ width: "100%", marginTop: 13 }} disabled={loading}>
            {loading ? "جارٍ الدخول..." : "دخول"}
          </button>
          {error && <p className="error-text">{error}</p>}
          <p className="center small" style={{ marginTop: 14 }}>
            <Link href="/forgot-password" style={{ color: "var(--g2)" }}>
              نسيت كلمة المرور؟
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
