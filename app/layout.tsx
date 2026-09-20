import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "منظومة متابعة حلقات القرآن",
  description: "متابعة علمية وتربوية متكاملة — الحفظ، المراجعة، التلاوة، الحضور والنقاط",
  applicationName: "حلقات القرآن",
  // Every page is behind a login — nothing here should be indexed.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#176b52",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
