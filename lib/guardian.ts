// Guardian contact: WhatsApp numbers, the private family page link, and wa.me message links.

/**
 * A phone number as typed → international digits for wa.me, or null if it can't be one.
 * Accepts "+963 912 345 678", "00963…" and the local "0912345678" (Syria, 963).
 */
export function normalizePhone(raw: string): string | null {
  let d = raw.replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x660)).replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0") && d.length === 10) d = "963" + d.slice(1);
  return /^[0-9]{7,15}$/.test(d) ? d : null;
}

/** "963912345678" → "+963 912 345 678" for display. */
export function formatPhone(phone: string): string {
  const m = phone.match(/^963(\d{3})(\d{3})(\d{3})$/);
  return m ? `+963 ${m[1]} ${m[2]} ${m[3]}` : `+${phone}`;
}

export function guardianUrl(token: string): string {
  return `${location.origin}/p/${token}`;
}

/** Opens WhatsApp with the message ready; to a number when there is one, else the contact picker. */
export function waLink(text: string, phone?: string | null): string {
  return `https://wa.me/${phone ?? ""}?text=${encodeURIComponent(text)}`;
}

export function guardianMessage(studentName: string, token: string): string {
  return `السلام عليكم ورحمة الله\nهذا رابط متابعة ${studentName} في حلقة القرآن (الحفظ والتلاوة والحضور والدروس):\n${guardianUrl(token)}\nالرابط خاص بكم، يرجى عدم مشاركته.`;
}

/** "منذ ساعتين" / "منذ 3 أيام" — when a family last opened their page. */
export function sinceLabel(iso: string | null | undefined): string {
  if (!iso) return "لم يُفتح بعد";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return "فُتح قبل قليل";
  const hours = Math.round(mins / 60);
  if (hours < 24) return hours <= 2 ? "فُتح منذ ساعة" : `فُتح منذ ${hours} ساعات`;
  const days = Math.round(hours / 24);
  return days === 1 ? "فُتح أمس" : days === 2 ? "فُتح منذ يومين" : `فُتح منذ ${days} ${days <= 10 ? "أيام" : "يومًا"}`;
}
