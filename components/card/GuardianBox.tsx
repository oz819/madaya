"use client";

import { useApp } from "@/components/AppContext";
import { confirmDialog } from "@/components/ConfirmDialog";
import { store, useStore } from "@/lib/offline/store";
import { formatPhone, guardianMessage, guardianUrl, sinceLabel, waLink } from "@/lib/guardian";

// رابط ولي الأمر in the student card: who the guardian is, the family's private page link
// (copy / send on WhatsApp), when they last opened it, and — admin only — a new link.
export default function GuardianBox({ studentId, onEdit }: { studentId: string; onEdit: () => void }) {
  const s = useStore();
  const { supabase, profile, showToast } = useApp();
  const student = s.get("students", studentId)!;
  const link = s.get("guardian_links", studentId);
  const phone = student.guardian_phone;

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(guardianUrl(link.token));
      showToast("تم نسخ رابط ولي الأمر");
    } catch {
      prompt("انسخ الرابط:", guardianUrl(link.token));
    }
  }

  async function rotate() {
    const ok = await confirmDialog({
      title: "إلغاء الرابط الحالي وتوليد رابط جديد؟",
      body: "الرابط القديم يتوقف عن العمل فورًا، ويجب إرسال الرابط الجديد للأهل.",
      ok: "رابط جديد",
      danger: true,
    });
    if (!ok) return;
    const { error } = await supabase.rpc("rotate_guardian_link", { p_student_id: studentId });
    if (error) return showToast(/fetch|network/i.test(error.message) ? "تحتاج اتصالًا بالإنترنت" : error.message);
    const { data } = await supabase.from("guardian_links").select("*").eq("student_id", studentId);
    if (data) await store.applyRemote("guardian_links", data);
    showToast("تم توليد رابط جديد — أرسله للأهل");
  }

  return (
    <div className="guardian-box">
      <div>
        <span className="muted">ولي الأمر: </span>
        {student.guardian_name || phone ? (
          <b>
            {student.guardian_name ?? ""}
            {phone && (
              <bdi dir="ltr" className="phone">
                {formatPhone(phone)}
              </bdi>
            )}
          </b>
        ) : (
          <button className="link" onClick={onEdit}>
            + أضف اسم ولي الأمر ورقمه
          </button>
        )}
        {link && <div className="small muted">صفحة المتابعة: {sinceLabel(link.last_opened_at)}{link.open_count > 1 ? ` · ${link.open_count} مرة` : ""}</div>}
      </div>
      {link ? (
        <div className="row-actions">
          <button className="secondary" onClick={copy}>
            🔗 نسخ رابط ولي الأمر
          </button>
          <a className="btn secondary" href={waLink(guardianMessage(student.name, link.token), phone)} target="_blank" rel="noreferrer">
            إرسال على واتساب
          </a>
          {profile.role === "ADMIN" && (
            <button className="link danger-link" onClick={rotate}>
              رابط جديد
            </button>
          )}
        </div>
      ) : (
        <span className="small muted">الرابط يظهر بعد أول مزامنة مع الإنترنت.</span>
      )}
    </div>
  );
}
