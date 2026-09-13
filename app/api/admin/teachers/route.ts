import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { createAdminClient } from "@/utils/supabase/admin";

// Creating a teacher account requires the Supabase Auth Admin API (service_role), which the
// browser can never call directly — this is the one legitimate reason this app has a
// traditional server route instead of a direct client -> Postgres call.
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status });

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!name || !email || password.length < 8) {
    return NextResponse.json({ error: "أكمل بيانات المحفظ (كلمة المرور 8 أحرف على الأقل)" }, { status: 400 });
  }

  let adminClient;
  try {
    adminClient = createAdminClient();
  } catch {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY غير مضبوط على الخادم — راجع .env.local.example" },
      { status: 500 }
    );
  }

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    return NextResponse.json({ error: createError?.message || "تعذّر إنشاء الحساب" }, { status: 400 });
  }

  const { error: profileError } = await adminClient
    .from("profiles")
    .insert({ id: created.user.id, name, role: "TEACHER", active: true });
  if (profileError) {
    // Roll back the orphaned auth user so a failed profile insert doesn't leave a half-created account.
    await adminClient.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  return NextResponse.json({ id: created.user.id, name, email }, { status: 201 });
}
