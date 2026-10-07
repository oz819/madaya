"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Amiri, Reem_Kufi } from "next/font/google";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { NOT_REGISTERED_MESSAGE } from "@/lib/messages";
import { FacebookIcon, GitHubIcon, InstagramIcon, WhatsAppIcon } from "@/components/SocialIcons";

// Amiri for the about text, Reem Kufi for headings (exposed as CSS variables, see globals.css).
const amiri = Amiri({ subsets: ["arabic"], weight: ["400", "700"], variable: "--font-amiri", display: "swap" });
const reemKufi = Reem_Kufi({ subsets: ["arabic"], variable: "--font-reem-kufi", display: "swap" });

const SOCIAL_LINKS = [
  { href: "https://www.facebook.com/share/1HjPsLvumo/", label: "صفحتنا على فيسبوك", Icon: FacebookIcon },
  { href: "https://www.instagram.com/lmrkzlthqfyldwy", label: "حسابنا على انستغرام", Icon: InstagramIcon },
  { href: "https://wa.me/963993323763", label: "تواصل معنا عبر واتساب", Icon: WhatsAppIcon },
];

type Step = "email" | "code";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // The page opens on the centre's landing view; the existing login form shows in a dialog.
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    if (!showLogin) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setShowLogin(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showLogin]);

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
    // shouldCreateUser: false — only accounts the admin created can sign in (spec §3.2). For an
    // unknown email Supabase answers otp_disabled / signup_disabled and no auth.users row is
    // created. This flag is only page code; the real block is "Allow new users to sign up" being
    // off in the Supabase dashboard (see README).
    const { error } = await supabase.auth.signInWithOtp({
      email: submittedEmail,
      options: { shouldCreateUser: false },
    });
    setLoading(false);
    if (error) {
      // unexpected_failure here is Supabase relaying a hard SMTP-provider rejection (e.g. a
      // sender-domain restriction) — a real delivery failure, not a client bug. Say so plainly
      // instead of a bare status code; never claim the code was sent when it wasn't.
      setError(
        error.code === "otp_disabled" || error.code === "signup_disabled" || error.code === "user_not_found"
          ? NOT_REGISTERED_MESSAGE
          : error.code === "over_email_send_rate_limit"
          ? "تم إرسال عدد كبير من الطلبات. انتظر قليلًا ثم أعد المحاولة."
          : error.code === "unexpected_failure"
          ? "تعذّر إرسال البريد الإلكتروني حاليًا بسبب مشكلة في خدمة البريد. أعد المحاولة لاحقًا أو تواصل مع المدير."
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
    <div className={`landing islamic-bg ${amiri.variable} ${reemKufi.variable}`} dir="rtl" lang="ar">
      {/* Decorative, CSS-only background motion (see "Landing motion" in globals.css). */}
      <div className="landing-sky" aria-hidden="true">
        {/* Large soft light blobs drifting at different speeds, like a calm aurora. */}
        {[...Array(5)].map((_, i) => (
          <span key={i} className={`aurora a${i + 1}`} />
        ))}
        {/* Faint gold eight-point-star lattice drifting diagonally. */}
        <div className="landing-pattern" />
        <div className="landing-art">
          <span className="moon-glow" />
        </div>
        {[...Array(7)].map((_, i) => (
          <span key={i} className={`twinkle t${i + 1}`} />
        ))}
      </div>

      <button type="button" className="login-trigger" onClick={() => setShowLogin(true)} aria-haspopup="dialog">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
        </svg>
        <span>تسجيل الدخول</span>
      </button>

      <main className="landing-hero">
        <div className="logo-wrap">
          <Image
            src="/images/logo.png"
            alt="شعار المركز الثقافي الدعوي في مضايا"
            width={300}
            height={300}
            className="landing-logo"
            priority
          />
        </div>
        <h1 className="landing-title">المركز الثقافي الدعوي في مضايا</h1>
        <div className="brand-divider" />
        <section className="landing-about">
          <span className="corner tl" aria-hidden="true" />
          <span className="corner tr" aria-hidden="true" />
          <span className="corner bl" aria-hidden="true" />
          <span className="corner br" aria-hidden="true" />
          <h2>نبذة عن المركز</h2>
          <div className="ornament" aria-hidden="true">
            <i />
            <span>✦</span>
            <i />
          </div>
          <p>
            تأسس المركز الثقافي الدعوي في مضايا عام 2025 في بلدة مضايا بريف دمشق، بعد ترميم مبناه وإعادة تأهيله، ليتحول من مقرٍّ لنشر عقائد حزب البعث إلى منارةٍ للعلم والهدى، وذلك بإشراف{" "}
            <a href="https://alabdah.com/about" target="_blank" rel="noopener noreferrer">
              د. محمد العبده
            </a>
            .
          </p>
          <p>
            يحتضن المركز حلقات تحفيظ القرآن الكريم وتدارسه، ويقيم الدورات العلمية، ويفتح أبوابه للشباب بأنشطة ثقافية وتربوية هادفة يجدون فيها بغيتهم.
          </p>
          <p>نسأل الله أن يبارك في هذا المركز وأن يوفقه للاستمرار وأداء رسالته، ولا تنسونا من صالح دعائكم.</p>
        </section>

        <div className="landing-social" role="navigation" aria-label="روابط التواصل">
          <h3>تابعونا</h3>
          <ul>
            {SOCIAL_LINKS.map(({ href, label, Icon }) => (
              <li key={href}>
                <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label} title={label}>
                  <Icon />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </main>

      {showLogin && (
        <div className="login-overlay" onClick={() => setShowLogin(false)}>
          <div className="loginbox islamic-card" role="dialog" aria-modal="true" aria-label="تسجيل الدخول" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="login-close" onClick={() => setShowLogin(false)} aria-label="إغلاق">
              ✕
            </button>
            <div className="brand">
              <h1 className="brand-main">مركز مضايا الثقافي</h1>
              <h2 className="brand-sub">حلقات القرآن</h2>
              <div className="brand-divider" />
            </div>
            <p className="center muted">منظومة متابعة الحفظ والمراجعة والتلاوة والنمو التربوي</p>

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
      )}

      <a className="github-link" href="https://github.com/oz819/madaya" target="_blank" rel="noopener noreferrer" aria-label="الكود المصدري على GitHub">
        <GitHubIcon />
        <span>GitHub</span>
      </a>
    </div>
  );
}
