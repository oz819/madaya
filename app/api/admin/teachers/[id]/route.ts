import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/requireAdmin";
import { createAdminClient } from "@/utils/supabase/admin";

const RECORD_TABLES = ["quran_entries", "attendance", "arabic_entries", "edu_notes", "talqeen_sessions"] as const;

function adminClientOrError() {
  try {
    return { client: createAdminClient() };
  } catch {
    return {
      error: NextResponse.json(
        { error: "SUPABASE_SERVICE_ROLE_KEY غير مضبوط على الخادم — راجع .env.local.example" },
        { status: 500 },
      ),
    };
  }
}

// Edit a staff account: display name (profiles) and/or login email (Auth Admin API).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : undefined;
  const email = typeof body?.email === "string" ? body.email.trim() : undefined;
  if (name === "" || email === "") return NextResponse.json({ error: "الاسم والبريد لا يمكن أن يكونا فارغين" }, { status: 400 });
  if (name === undefined && email === undefined) return NextResponse.json({ error: "لا يوجد ما يُعدَّل" }, { status: 400 });

  const { client, error: cfgError } = adminClientOrError();
  if (!client) return cfgError;

  if (email !== undefined) {
    const { error } = await client.auth.admin.updateUserById(id, { email, email_confirm: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (name !== undefined) {
    const { error } = await client.from("profiles").update({ name }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

// Permanently delete a staff account. Records keep a non-cascading reference to their teacher
// (and the database pins teacher_id on update), so an account that has recorded anything can't be
// deleted without losing who recorded it — those are refused with a count and should be disabled.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status });

  const { id } = await params;
  if (id === admin.userId) return NextResponse.json({ error: "لا يمكنك حذف حسابك أنت" }, { status: 400 });

  const { client, error: cfgError } = adminClientOrError();
  if (!client) return cfgError;

  let records = 0;
  for (const table of RECORD_TABLES) {
    const { count, error } = await client.from(table).select("*", { count: "exact", head: true }).eq("teacher_id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    records += count ?? 0;
  }
  if (records > 0) {
    return NextResponse.json(
      {
        error: `لا يمكن حذف هذا الحساب لأن له ${records} سجلًا محفوظًا باسمه (تسميع/حضور/ملاحظات). الحذف كان سيُفقد معرفة من سجّلها — استخدم «تعطيل» بدلًا منه، فيبقى السجل ولا يستطيع الدخول.`,
        records,
      },
      { status: 409 },
    );
  }

  // Deleting the auth user cascades to its profiles row.
  const { error } = await client.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
