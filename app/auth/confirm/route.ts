import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

// Landing point for every link Supabase Auth emails out (account confirmation, password
// recovery, email change). Establishes the session, then forwards to `next`.
//
// Two link shapes are accepted on purpose, because which one arrives depends on how the email
// templates are configured in the Supabase dashboard:
//   1. token_hash + type  — the PKCE-safe shape ({{ .TokenHash }} templates). Preferred: it
//      works even when the mail app opens the link in a different browser than the one that
//      requested it, which is the common case on phones.
//   2. code               — what the stock {{ .ConfirmationURL }} template ends up producing.
// See EMAIL_SETUP.md for the exact templates to paste into the dashboard.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  // Only allow forwarding to a path on this app — never to an attacker-supplied absolute URL.
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}${safeNext}`);
    return NextResponse.redirect(`${origin}/login?authError=${encodeURIComponent(error.message)}`);
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${safeNext}`);
    return NextResponse.redirect(`${origin}/login?authError=${encodeURIComponent(error.message)}`);
  }

  return NextResponse.redirect(`${origin}/login?authError=missing_token`);
}
