"use client";

import { useStore } from "@/lib/offline/store";
import { SECTION_LABEL, effectiveFilter, filterCircleIds, filterLabel, filterOptions, useFilter, type Filter } from "@/lib/filter";

/** The shared filter, resolved against the halaqat on this device. */
export function useScope() {
  const s = useStore();
  const [saved, setFilter] = useFilter();
  const circles = s.all("circles").filter((c) => c.active).sort((a, b) => a.name.localeCompare(b.name, "ar"));
  const filter = effectiveFilter(saved, circles);
  const ids = filterCircleIds(filter, circles);
  return {
    filter,
    setFilter,
    circles,
    /** The halaqat the filter covers (all of them when it's off). */
    scopedCircles: ids ? circles.filter((c) => ids.has(c.id)) : circles,
    inScope: (circleId: string) => !ids || ids.has(circleId),
    label: filterLabel(filter, circles),
  };
}

// Always visible above the lists: what is shown right now, and ✕ to show everyone again.
export default function FilterBar() {
  const { filter, setFilter, circles } = useScope();
  const opts = filterOptions(circles);
  if (!opts.sections.length && circles.length < 2) return null;
  const on = filter !== "all";

  return (
    <div className={`filter-bar ${on ? "on" : ""}`}>
      <span className="filter-label">عرض:</span>
      <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} aria-label="فرز الطلاب">
        <option value="all">كل الطلاب</option>
        {opts.sections.length > 0 && (
          <optgroup label="الأقسام">
            {opts.sections.map((sec) => (
              <option key={sec} value={`s:${sec}`}>
                {SECTION_LABEL[sec]}
              </option>
            ))}
          </optgroup>
        )}
        {opts.circles.length > 0 && (
          <optgroup label="الحلقات">
            {opts.circles.map((c) => (
              <option key={c.id} value={`c:${c.id}`}>
                {c.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      {on && (
        <button className="filter-clear" onClick={() => setFilter("all")} aria-label="مسح الفرز" title="مسح الفرز">
          ✕
        </button>
      )}
    </div>
  );
}
