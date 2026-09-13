import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Android (Capacitor) test build loads the app from this machine's LAN address, not
  // localhost. Without listing it here, `next dev` blocks its own dev resources (/_next/*) as
  // cross-origin, so the client-side JS never boots properly on the phone — the login form
  // submits but the post-login navigation silently fails. Dev-only setting; has no effect on
  // `next build` / production.
  allowedDevOrigins: ["192.168.100.9"],
};

export default nextConfig;
