import "server-only";
import { createClient } from "@/utils/supabase/server";

// Verifies the current session belongs to an active admin using the normal cookie-bound
// (RLS-respecting) client — never trust a route handler's own logic alone; this re-checks
// the same is_admin() condition the database itself enforces.
export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401, error: "غير مسجّل الدخول" };

  const { data: profile } = await supabase.from("profiles").select("role,active").eq("id", user.id).single();
  if (!profile || profile.role !== "ADMIN" || !profile.active) {
    return { ok: false as const, status: 403, error: "هذا الإجراء متاح للمدير فقط" };
  }
  return { ok: true as const, userId: user.id };
}
