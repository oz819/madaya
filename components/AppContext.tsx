"use client";

import { createContext, useContext } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { Profile } from "@/lib/types";
import type { Mushaf } from "@/lib/quran";

export type AppCtx = {
  supabase: SupabaseClient<Database>;
  profile: Profile;
  mushaf: Mushaf;
  showToast: (t: string) => void;
};

export const AppContext = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp outside AppContext");
  return ctx;
}
