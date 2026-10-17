"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/AppContext";
import { LOCAL_WINDOW_DAYS, useStore } from "@/lib/offline/store";
import { addDays, todayStr } from "@/lib/types";
import type { RankData } from "@/lib/ranking";

/**
 * Everything the rankings need for a period. This device keeps the last LOCAL_WINDOW_DAYS days,
 * live and including unsynced edits, so periods inside that window are read locally. Older
 * periods come from the server (report_data); offline they fall back to the local copy and
 * `partial` says it may be incomplete.
 */
export function useRankData(from: string, to: string, circleId: string | null) {
  const s = useStore();
  const { supabase } = useApp();
  const [remote, setRemote] = useState<{ key: string; data: RankData } | null>(null);
  const [error, setError] = useState("");
  const key = `${from}|${to}|${circleId ?? ""}`;
  const needsServer = from < addDays(todayStr(), -LOCAL_WINDOW_DAYS + 1);

  useEffect(() => {
    if (!needsServer || !navigator.onLine) return;
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase.rpc("report_data", {
        p_from: from,
        p_to: to,
        ...(circleId ? { p_circle_id: circleId } : {}),
      });
      if (cancelled) return;
      if (err) {
        if (!/fetch|network/i.test(err.message)) setError(err.message);
        return;
      }
      const r = data as unknown as Partial<RankData>;
      setError("");
      setRemote({
        key,
        data: { quran: r.quran ?? [], attendance: r.attendance ?? [], tarbiya: r.tarbiya ?? [], activities: r.activities ?? [] },
      });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, key, needsServer]);

  if (needsServer && remote?.key === key) return { data: remote.data, partial: false, error };
  const inP = (d: string) => d >= from && d <= to;
  const local: RankData = {
    quran: s.all("quran_entries").filter((e) => !e.deleted_at && inP(e.entry_date)),
    attendance: s.all("attendance").filter((a) => !a.deleted_at && inP(a.att_date)),
    tarbiya: s.all("edu_notes").filter((n) => !n.deleted_at && inP(n.record_date)),
    activities: s.all("activities").filter((a) => !a.deleted_at && inP(a.activity_date)),
  };
  return { data: local, partial: needsServer, error };
}
