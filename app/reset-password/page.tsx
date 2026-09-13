"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";

// Reached after /auth/confirm establishes a recovery session from the emailed link. Also usable
// by an already-signed-in user who just wants to change their own password.
export default function ResetPasswordPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setHasSession(!!user);
      setChecking(false);
    })();
  }, [supabase]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) return setError("كلمة المرور يجب أن تكون 8 أحرف على الأقل");
    if (password !== confirm) return setError("كلمتا المرور غير متطابقتين");

    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDone(true);
  }

  if (checking) {
    return (
      <div className="login">
        <p className="muted">جارٍ التحقق...</p>
      </div>
    );
  }

  return (
    <div className="login">
      <div className="loginbox">
        <h1>📖 حلقات القرآن</h1>
        <p className="center muted">تعيين كلمة مرور جديدة</p>

        {!hasSession ? (
          <>
            <div className="notice" style={{ marginTop: 18 }}>
              هذا الرابط غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا من صفحة &quot;نسيت كلمة المرور&quot;.
            </div>
            <Link href="/forgot-password">
              <button style={{ width: "100%", marginTop: 13 }}>طلب رابط جديد</button>
            </Link>
          </>
        ) : done ? (
          <>
            <div className="notice" style={{ marginTop: 18 }}>تم تحديث كلمة المرور بنجاح.</div>
            <button style={{ width: "100%", marginTop: 13 }} onClick={() => router.replace("/")}>
              الدخول إلى النظام
            </button>
          </>
        ) : (
          <form onSubmit={submit} style={{ marginTop: 18 }}>
            <label>كلمة المرور الجديدة</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
            <label style={{ marginTop: 9 }}>تأكيد كلمة المرور</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            <button type="submit" style={{ width: "100%", marginTop: 13 }} disabled={saving}>
              {saving ? "جارٍ الحفظ..." : "حفظ كلمة المرور"}
            </button>
            {error && <p className="error-text">{error}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
