import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "منظومة متابعة حلقات القرآن",
  description: "متابعة علمية وتربوية متكاملة — الحفظ، المراجعة، التلاوة، الحضور والنقاط",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
