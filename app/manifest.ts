import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "منظومة متابعة حلقات القرآن",
    short_name: "حلقات القرآن",
    description: "متابعة علمية وتربوية متكاملة — الحفظ، المراجعة، التلاوة، الحضور والنقاط",
    lang: "ar",
    dir: "rtl",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f4f7f5",
    theme_color: "#176b52",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
