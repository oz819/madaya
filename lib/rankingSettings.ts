"use client";

// The ranking settings row (weights, grade values, week start, course start), shared by every
// page that ranks. Read from the server when online and remembered on the device for offline use;
// only an admin saves changes (RLS enforces it).

import { useEffect, useSyncExternalStore } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { DEFAULT_SETTINGS, ITEMS, type RankingSettings, type Weights } from "@/lib/ranking";

const LOCAL_KEY = "ranking:settings";

type Row = Database["public"]["Tables"]["ranking_settings"]["Row"];

function fromRow(r: Row): RankingSettings {
  const w = (r.weights ?? {}) as Record<string, unknown>;
  const weights = Object.fromEntries(ITEMS.map((i) => [i.key, Number(w[i.key]) || 0])) as Weights;
  const g = (r.grades ?? {}) as Record<string, unknown>;
  const grades = Object.fromEntries(Object.entries(g).map(([k, v]) => [k, Number(v)]));
  return { weights, grades, weekStart: r.week_start, courseStart: r.course_start };
}

function readLocal(): RankingSettings | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as RankingSettings) } : null;
  } catch {
    return null;
  }
}

class SettingsStore {
  private value: RankingSettings = DEFAULT_SETTINGS;
  private loaded = false;
  private listeners = new Set<() => void>();
  error = "";

  get = () => this.value;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  private apply(v: RankingSettings) {
    this.value = v;
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(v));
    } catch {}
    for (const l of this.listeners) l();
  }

  async load(sb: SupabaseClient<Database>) {
    if (this.loaded) return;
    this.loaded = true;
    const local = readLocal();
    if (local) {
      this.value = local;
      for (const l of this.listeners) l();
    }
    if (!navigator.onLine) return;
    const { data, error } = await sb.from("ranking_settings").select("*").eq("id", 1).maybeSingle();
    if (error) {
      this.error = error.message;
      this.loaded = false;
      return;
    }
    if (data) this.apply(fromRow(data));
  }

  /** Admin only. Resolves with an error message, or "" when saved. */
  async save(sb: SupabaseClient<Database>, next: RankingSettings): Promise<string> {
    if (!navigator.onLine) return "حفظ الإعدادات يحتاج اتصالًا بالإنترنت.";
    const { data, error } = await sb
      .from("ranking_settings")
      .update({ weights: next.weights, grades: next.grades, week_start: next.weekStart, course_start: next.courseStart })
      .eq("id", 1)
      .select("*")
      .maybeSingle();
    if (error) return error.message;
    if (!data) return "لم تُحفظ الإعدادات: هذا الإجراء للمدير فقط.";
    this.apply(fromRow(data));
    return "";
  }
}

export const rankingSettings = new SettingsStore();

export function useRankingSettings(sb: SupabaseClient<Database>): RankingSettings {
  const v = useSyncExternalStore(rankingSettings.subscribe, rankingSettings.get, () => DEFAULT_SETTINGS);
  useEffect(() => {
    rankingSettings.load(sb);
  }, [sb]);
  return v;
}
