"use client";

import { useLayoutEffect, useRef } from "react";

// Adapted from 21st.dev "Animated Tabs" (ibelick) without framer-motion: drop this inside a row of
// buttons and it glides a highlight behind whichever direct child button has the "active" class.
export default function SlidingIndicator({ active }: { active: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const row = el?.parentElement;
    if (!el || !row) return;
    const place = () => {
      const btn = row.querySelector<HTMLElement>(":scope > button.active");
      if (!btn) {
        el.style.opacity = "0";
        return;
      }
      el.style.opacity = "1";
      el.style.transform = `translate(${btn.offsetLeft}px, ${btn.offsetTop}px)`;
      el.style.width = `${btn.offsetWidth}px`;
      el.style.height = `${btn.offsetHeight}px`;
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(row);
    return () => ro.disconnect();
  }, [active]);

  return <span ref={ref} className="slide-pill" aria-hidden="true" />;
}
