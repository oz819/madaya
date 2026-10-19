import type { JuzProgress } from "@/lib/juz";

// The 30 juz' as a grid: filled green when memorized in full, partly filled by the share
// memorized, plain when not started. Each cell says its percent in words for screen readers.
export default function JuzGrid({
  juz,
  selected,
  onSelect,
}: {
  juz: JuzProgress[];
  selected?: number | null;
  onSelect?: (n: number) => void;
}) {
  return (
    <div className="juz-grid" role="list" aria-label="خريطة الأجزاء الثلاثين">
      {juz.map((j) => {
        const cls = `juz-cell ${j.percent === 100 ? "full" : j.percent > 0 ? "part" : ""} ${selected === j.juz ? "sel" : ""}`;
        const label = `الجزء ${j.juz}: ${j.percent === 100 ? "محفوظ كاملًا" : j.percent ? `${j.percent}%` : "لم يبدأ"}`;
        const style = { "--fill": `${j.percent}%` } as React.CSSProperties;
        return onSelect ? (
          <button key={j.juz} type="button" role="listitem" className={cls} style={style} title={label} aria-label={label} onClick={() => onSelect(j.juz)}>
            {j.juz}
          </button>
        ) : (
          <span key={j.juz} role="listitem" className={cls} style={style} title={label} aria-label={label}>
            {j.juz}
          </span>
        );
      })}
    </div>
  );
}
