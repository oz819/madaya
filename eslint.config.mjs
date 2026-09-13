import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Flags the standard `useEffect(() => { load() }, [deps])` data-fetch-on-mount pattern
      // (an async function that eventually calls setState after an await) as if setState were
      // called synchronously in the effect body. That's the intended, idiomatic pattern here —
      // every section component loads its own data this way — so this is a false positive.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Superseded Express/Prisma prototype, kept locally only — not part of the shipped app.
    "_deprecated_express_backend_prototype/**",
    // Generated native build output (Capacitor bridge, merged assets) — not hand-written source.
    "android/**",
  ]),
]);

export default eslintConfig;
