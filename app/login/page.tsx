"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

type Step = "email" | "code";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    // Read the field straight off the form instead of trusting the `email` state: some browsers
    // (Chrome autofill on Android especially) fill the input's DOM value without firing a React
    // onChange, which would otherwise send an empty email to Supabase.
    const submittedEmail = (new FormData(e.currentTarget).get("email") as string | null)?.trim() ?? "";
    if (!submittedEmail) {
      setError("الرجاء إدخال البريد الإلكتروني.");
      return;
    }
    setEmail(submittedEmail);

    setLoading(true);
    const supabase = createClient();
    // shouldCreateUser: false — accounts are provisioned by the admin only; a code request for an
    // unknown address must not silently create one.
    const { error } = await supabase.auth.signInWithOtp({
      email: submittedEmail,
      options: { shouldCreateUser: false },
    });
    setLoading(false);
    if (error) {
      setError(
        error.code === "over_email_send_rate_limit"
          ? "تم إرسال عدد كبير من الطلبات. انتظر قليلًا ثم أعد المحاولة."
          : `تعذّر إرسال الكود (${error.code ?? error.status ?? "خطأ غير معروف"}). راجع الإعداد أو تواصل مع المدير.`
      );
      return;
    }
    setStep("code");
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: "email",
    });
    setLoading(false);
    if (error) {
      setError(
        error.code === "otp_expired"
          ? "الكود غير صحيح أو منتهي الصلاحية."
          : `تعذّر تأكيد الكود (${error.code ?? error.status ?? "خطأ غير معروف"}).`
      );
      return;
    }

    router.replace("/");
    router.refresh();
  }

  function backToEmail() {
    setStep("email");
    setCode("");
    setError("");
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

        {step === "email" ? (
          <form onSubmit={sendCode} style={{ marginTop: 18 }}>
            <label>البريد الإلكتروني</label>
            <input
              type="email"
              name="email"
              defaultValue={email}
              required
              autoFocus
              autoComplete="email"
            />
            <button type="submit" style={{ width: "100%", marginTop: 13 }} disabled={loading}>
              {loading ? "جارٍ الإرسال..." : "إرسال كود الدخول"}
            </button>
            {error && <p className="error-text">{error}</p>}
          </form>
        ) : (
          <form onSubmit={verifyCode} style={{ marginTop: 18 }}>
            <div className="notice">
              أُرسل كود مكوّن من 6 أرقام إلى <b>{email}</b>. تفقّد بريدك (وصندوق الرسائل غير المرغوبة أيضًا).
            </div>
            <label style={{ marginTop: 12 }}>كود الدخول</label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className="otp-input"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              required
              autoFocus
            />
            <button type="submit" style={{ width: "100%", marginTop: 13 }} disabled={loading || code.length !== 6}>
              {loading ? "جارٍ التحقق..." : "تأكيد الدخول"}
            </button>
            {error && <p className="error-text">{error}</p>}
            <button
              type="button"
              className="secondary"
              style={{ width: "100%", marginTop: 9 }}
              onClick={backToEmail}
              disabled={loading}
            >
              تغيير البريد الإلكتروني
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
