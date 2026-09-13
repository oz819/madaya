"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/confirm?next=/reset-password`,
    });
    setLoading(false);

    if (error) {
      setError(
        error.message.includes("rate limit")
          ? "تم إرسال عدد كبير من الرسائل. انتظر قليلًا ثم أعد المحاولة."
          : "تعذّر إرسال الرسالة. تأكد من البريد الإلكتروني وأعد المحاولة."
      );
      return;
    }
    // Always show the same confirmation, even for an unknown address, so this page can't be
    // used to discover which emails have accounts.
    setSent(true);
  }

  return (
    <div className="login">
      <div className="loginbox">
        <h1>📖 حلقات القرآن</h1>
        <p className="center muted">إعادة تعيين كلمة المرور</p>

        {sent ? (
          <>
            <div className="notice" style={{ marginTop: 18 }}>
              إذا كان هذا البريد مسجّلًا في النظام، فقد أُرسل إليه رابط لتعيين كلمة مرور جديدة. تفقّد بريدك (وصندوق
              الرسائل غير المرغوبة أيضًا). الرابط صالح لفترة محدودة.
            </div>
            <Link href="/login">
              <button className="secondary" style={{ width: "100%", marginTop: 13 }}>
                العودة لتسجيل الدخول
              </button>
            </Link>
          </>
        ) : (
          <form onSubmit={submit} style={{ marginTop: 18 }}>
            <label>البريد الإلكتروني</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            <button type="submit" style={{ width: "100%", marginTop: 13 }} disabled={loading}>
              {loading ? "جارٍ الإرسال..." : "إرسال رابط إعادة التعيين"}
            </button>
            {error && <p className="error-text">{error}</p>}
            <p className="center small" style={{ marginTop: 14 }}>
              <Link href="/login" style={{ color: "var(--g2)" }}>
                العودة لتسجيل الدخول
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
