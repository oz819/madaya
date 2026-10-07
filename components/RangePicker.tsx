"use client";

import type { Mushaf, QuranRange } from "@/lib/quran";

// From surah:ayah → to surah:ayah. Ranges may span surahs (muraja'a over a juz', spec §4.3).
export default function RangePicker({
  mushaf,
  value,
  onChange,
}: {
  mushaf: Mushaf;
  value: QuranRange;
  onChange: (r: QuranRange) => void;
}) {
  function setFromSurah(no: number) {
    const from = { surah: no, ayah: 1 };
    // Keep "to" at or after "from" so the common single-surah case needs one pick.
    const to = mushaf.index(value.to) < mushaf.index(from) || value.to.surah === value.from.surah ? { surah: no, ayah: mushaf.ayahCount(no) } : value.to;
    onChange({ from, to });
  }

  return (
    <div className="range">
      <div className="range-side">
        <label>من سورة</label>
        <select value={value.from.surah} onChange={(e) => setFromSurah(Number(e.target.value))}>
          {mushaf.surahs.map((s) => (
            <option key={s.surah_no} value={s.surah_no}>
              {s.surah_no}. {s.name}
            </option>
          ))}
        </select>
        <label>آية</label>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={mushaf.ayahCount(value.from.surah)}
          value={value.from.ayah || ""}
          onChange={(e) => onChange({ ...value, from: { ...value.from, ayah: Number(e.target.value) } })}
        />
      </div>
      <div className="range-side">
        <label>إلى سورة</label>
        <select
          value={value.to.surah}
          onChange={(e) => {
            const no = Number(e.target.value);
            onChange({ ...value, to: { surah: no, ayah: Math.min(value.to.ayah || 1, mushaf.ayahCount(no)) } });
          }}
        >
          {mushaf.surahs.map((s) => (
            <option key={s.surah_no} value={s.surah_no}>
              {s.surah_no}. {s.name}
            </option>
          ))}
        </select>
        <label>آية</label>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={mushaf.ayahCount(value.to.surah)}
          value={value.to.ayah || ""}
          onChange={(e) => onChange({ ...value, to: { ...value.to, ayah: Number(e.target.value) } })}
        />
      </div>
    </div>
  );
}
