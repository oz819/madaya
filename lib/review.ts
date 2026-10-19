// اقتراح المراجعة: what a student should review today from what they memorized before. The
// memorized ayat (from their hifz entries) are cut into review portions — a long surah into
// pieces of about 20–25 ayat, short surahs grouped up to about 15 — and each portion is scored by
// how long since it was last memorized or reviewed, plus a push when its last grade was weak.

import { entryRange, type Mushaf, type QuranRange } from "@/lib/quran";
import { mergeSpans } from "@/lib/juz";
import { daysBetween } from "@/lib/ranking";
import type { QuranEntry } from "@/lib/types";

export type ReviewSuggestion = {
  range: QuranRange;
  ayat: number;
  lastDate: string;
  daysAgo: number;
  lastQuality: string | null;
  reason: string;
};

const WEAK_BONUS: Record<string, number> = { إعادة: 21, تمكين: 14, جيد: 5 };
const MAX_PIECE = 25;
const MIN_GROUP = 15;

/** Absolute index → { surah, ayah }. */
function posOf(mushaf: Mushaf, index: number) {
  for (const s of mushaf.surahs) {
    const first = mushaf.index({ surah: s.surah_no, ayah: 1 });
    if (index < first + s.ayah_count) return { surah: s.surah_no, ayah: index - first + 1 };
  }
  const last = mushaf.surahs[mushaf.surahs.length - 1];
  return { surah: last.surah_no, ayah: last.ayah_count };
}

/** Memorized spans cut into review portions [first, last] (absolute ayah indexes). */
export function reviewPortions(mushaf: Mushaf, spans: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const [a, b] of spans) {
    let group: [number, number] | null = null;
    const flush = () => {
      if (group) out.push(group);
      group = null;
    };
    for (const s of mushaf.surahs) {
      const first = mushaf.index({ surah: s.surah_no, ayah: 1 });
      const last = first + s.ayah_count - 1;
      const x = Math.max(a, first);
      const y = Math.min(b, last);
      if (x > y) continue;
      const len = y - x + 1;
      if (len > MAX_PIECE + 5) {
        flush();
        const k = Math.ceil(len / MAX_PIECE);
        const size = Math.ceil(len / k);
        for (let i = x; i <= y; i += size) out.push([i, Math.min(y, i + size - 1)]);
      } else {
        group = group ? [group[0], y] : [x, y];
        if (group[1] - group[0] + 1 >= MIN_GROUP) flush();
      }
    }
    flush();
  }
  return out;
}

export function suggestReview(mushaf: Mushaf, entries: QuranEntry[], today: string, count = 3): ReviewSuggestion[] {
  const live = entries.filter((e) => !e.deleted_at && (e.track === "HIFZ" || e.track === "MURAJAA"));
  const spans = mergeSpans(
    live
      .filter((e) => e.track === "HIFZ")
      .map(entryRange)
      .filter((r): r is QuranRange => !!r)
      .map((r) => [mushaf.index(r.from), mushaf.index(r.to)] as [number, number])
  );
  if (!spans.length) return [];
  const seen = live
    .map((e) => {
      const r = entryRange(e);
      return r ? { a: mushaf.index(r.from), b: mushaf.index(r.to), e } : null;
    })
    .filter((x): x is { a: number; b: number; e: QuranEntry } => !!x);

  const scored = reviewPortions(mushaf, spans).map(([a, b]) => {
    const len = b - a + 1;
    // Entries that covered at least half of the portion count as having gone over it.
    const covering = seen
      .filter((x) => Math.min(b, x.b) - Math.max(a, x.a) + 1 >= len / 2)
      .sort((x, y) => y.e.entry_date.localeCompare(x.e.entry_date) || y.e.created_at.localeCompare(x.e.created_at));
    const latest = covering[0]?.e;
    const lastDate = latest?.entry_date ?? today;
    const daysAgo = Math.max(0, daysBetween(lastDate, today));
    const lastQuality = latest?.quality ?? null;
    const freshHifz = covering.some((x) => x.e.track === "HIFZ" && daysBetween(x.e.entry_date, today) <= 1);
    const score = daysAgo + (lastQuality ? (WEAK_BONUS[lastQuality] ?? 0) : 0);
    const range = { from: posOf(mushaf, a), to: posOf(mushaf, b) };
    const weak = lastQuality === "إعادة" || lastQuality === "تمكين";
    const reason = [
      daysAgo === 0
        ? "رُوجع اليوم"
        : daysAgo === 1
          ? "آخر مرة أمس"
          : daysAgo === 2
            ? "آخر مرة قبل يومين"
            : `آخر مرة قبل ${daysAgo} ${daysAgo <= 10 ? "أيام" : "يومًا"}`,
      weak ? `التقدير الأخير: ${lastQuality}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    return { range, ayat: len, lastDate, daysAgo, lastQuality, reason, score, freshHifz };
  });

  return scored
    .filter((x) => !x.freshHifz && (x.daysAgo > 0 || WEAK_BONUS[x.lastQuality ?? ""] > 5))
    .sort((x, y) => y.score - x.score || x.range.from.surah - y.range.from.surah)
    .slice(0, count)
    .map(({ range, ayat, lastDate, daysAgo, lastQuality, reason }) => ({ range, ayat, lastDate, daysAgo, lastQuality, reason }));
}
