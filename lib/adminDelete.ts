import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { store } from "@/lib/offline/store";

export type AdminDeletable = "profile" | "student" | "circle" | "arabic_book";

/**
 * Moves an admin-managed item to the trash (admin_soft_delete RPC, online only), then pulls the
 * row back so it disappears from local lists right away. Returns an error message or null.
 */
export async function adminSoftDelete(
  supabase: SupabaseClient<Database>,
  kind: AdminDeletable,
  id: string
): Promise<string | null> {
  const { error } = await supabase.rpc("admin_soft_delete", { p_kind: kind, p_id: id });
  if (error) return /fetch|network/i.test(error.message) ? "الحذف يحتاج اتصالًا بالإنترنت" : error.message;

  if (kind === "profile") {
    const { data } = await supabase.from("profiles").select("id,name,role,active,deleted_at").eq("id", id);
    if (data) await store.applyRemote("profiles", data);
  } else {
    const table = kind === "student" ? "students" : kind === "circle" ? "circles" : "arabic_books";
    const { data } = await supabase.from(table).select("*").eq("id", id);
    if (data) await store.applyRemote(table, data as never);
  }
  return null;
}
