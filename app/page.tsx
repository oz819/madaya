import { Reem_Kufi } from "next/font/google";
import AppShell from "@/components/AppShell";

// Reem Kufi for headings inside the app, same as the login landing.
const reemKufi = Reem_Kufi({ subsets: ["arabic"], variable: "--font-reem-kufi", display: "swap" });

export default function Home() {
  return (
    <div className={`app-bg ${reemKufi.variable}`}>
      <AppShell />
    </div>
  );
}
