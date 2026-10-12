"use client";

import { useEffect, useState } from "react";

// useState that survives leaving the screen, the app being closed, or the phone's back button
// (e.g. the circle filter on the students list). Per device, in localStorage; never shared.
export function usePersistentState<T>(key: string, initial: T): [T, (v: T) => void] {
  const storageKey = `ui:${key}`;
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {}
  }, [storageKey, value]);
  return [value, setValue];
}
