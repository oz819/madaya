import type { CapacitorConfig } from "@capacitor/cli";

// TEST BUILD: points the native app at the dev machine's LAN IP so it can be installed on a
// phone on the same Wi-Fi network for real-device testing, before any public deployment exists.
// `cleartext: true` allows plain HTTP for this only — switch both to a real https:// production
// URL (and drop cleartext) before producing the final release build. See ANDROID_APK.md.
const config: CapacitorConfig = {
  appId: "com.quranhalaqat.app",
  appName: "حلقات القرآن",
  webDir: "android-shell",
  server: {
    url: "http://192.168.100.9:3000",
    cleartext: true,
  },
};

export default config;
