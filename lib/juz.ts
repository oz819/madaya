import type { Mushaf, QuranPos, QuranRange } from "@/lib/quran";

// Where each of the 30 juz' starts (surah, ayah), Hafs / Madinah mushaf.
export const JUZ_STARTS: QuranPos[] = [
  { surah: 1, ayah: 1 },
  { surah: 2, ayah: 142 },
  { surah: 2, ayah: 253 },
  { surah: 3, ayah: 93 },
  { surah: 4, ayah: 24 },
  { surah: 4, ayah: 148 },
  { surah: 5, ayah: 82 },
  { surah: 6, ayah: 111 },
  { surah: 7, ayah: 88 },
  { surah: 8, ayah: 41 },
  { surah: 9, ayah: 93 },
  { surah: 11, ayah: 6 },
  { surah: 12, ayah: 53 },
  { surah: 15, ayah: 1 },
  { surah: 17, ayah: 1 },
  { surah: 18, ayah: 75 },
  { surah: 21, ayah: 1 },
  { surah: 23, ayah: 1 },
  { surah: 25, ayah: 21 },
  { surah: 27, ayah: 56 },
  { surah: 29, ayah: 46 },
  { surah: 33, ayah: 31 },
  { surah: 36, ayah: 28 },
  { surah: 39, ayah: 32 },
  { surah: 41, ayah: 47 },
  { surah: 46, ayah: 1 },
  { surah: 51, ayah: 31 },
  { surah: 58, ayah: 1 },
  { surah: 67, ayah: 1 },
  { surah: 78, ayah: 1 },
];

/** Absolute ayah span [first, last] of juz n (1-based). */
export function juzSpan(mushaf: Mushaf, n: number): [number, number] {
  const first = mushaf.index(JUZ_STARTS[n - 1]);
  const last = n < 30 ? mushaf.index(JUZ_STARTS[n]) - 1 : mushaf.total;
  return [first, last];
}

/** The juz an absolute ayah index falls in. */
export function juzOf(mushaf: Mushaf, index: number): number {
  let n = 1;
  for (let i = 1; i < 30; i++) if (mushaf.index(JUZ_STARTS[i]) <= index) n = i + 1;
  return n;
}

export type JuzProgress = { juz: number; total: number; memorized: number; percent: number };

/** How much of each juz the memorized ranges cover. */
export function juzProgress(mushaf: Mushaf, ranges: QuranRange[]): JuzProgress[] {
  const spans = mergeSpans(ranges.map((r) => [mushaf.index(r.from), mushaf.index(r.to)] as [number, number]));
  return JUZ_STARTS.map((_, i) => {
    const [a, b] = juzSpan(mushaf, i + 1);
    let memorized = 0;
    for (const [x, y] of spans) memorized += Math.max(0, Math.min(b, y) - Math.max(a, x) + 1);
    const total = b - a + 1;
    // 100% only when every ayah is in, and 1% as soon as any is: never round to "complete" or "none".
    const percent = memorized >= total ? 100 : memorized === 0 ? 0 : Math.min(99, Math.max(1, Math.round((memorized / total) * 100)));
    return { juz: i + 1, total, memorized, percent };
  });
}

/** Sorted, non-overlapping [first, last] spans. */
export function mergeSpans(spans: [number, number][]): [number, number][] {
  const sorted = spans.filter(([a, b]) => b >= a).sort((x, y) => x[0] - y[0]);
  const out: [number, number][] = [];
  for (const [a, b] of sorted) {
    const last = out[out.length - 1];
    if (last && a <= last[1] + 1) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}
