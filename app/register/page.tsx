import type { Metadata } from "next";
import PublicShell from "@/components/PublicShell";
import RegisterForm from "@/components/RegisterForm";

// تسجيل طالب جديد: a public form the centre sends to families. The request waits for the admin,
// who accepts it into a halaqa (الإدارة ← طلبات التسجيل).

export const metadata: Metadata = {
  title: "تسجيل طالب جديد — حلقات القرآن",
  robots: { index: false, follow: false },
};

export default function RegisterPage() {
  return (
    <PublicShell>
      <RegisterForm />
    </PublicShell>
  );
}
