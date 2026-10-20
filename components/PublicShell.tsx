import Image from "next/image";
import { Reem_Kufi } from "next/font/google";

// The frame of the public pages for families (no login): the family page, the registration form
// and the honor board. The centre's logo and name on the app's patterned background.

const reemKufi = Reem_Kufi({ subsets: ["arabic"], variable: "--font-reem-kufi", display: "swap" });

export default function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className={`app-bg ${reemKufi.variable}`}>
      <main className="guardian">
        <div className="guardian-brand">
          <Image src="/images/logo.png" alt="" width={56} height={56} />
          <div>
            <h1>المركز الثقافي الدعوي في مضايا</h1>
            <span className="muted">متابعة حلقات القرآن الكريم</span>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
