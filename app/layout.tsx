import type { Metadata, Viewport } from "next";
import "./globals.css";
import ServiceWorker from "@/components/ServiceWorker";

export const metadata: Metadata = {
  title: "منظومة متابعة حلقات القرآن",
  description: "متابعة الحفظ والتلاوة والمراجعة والتلقين والعربية والتربية — تعمل بدون إنترنت",
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
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
