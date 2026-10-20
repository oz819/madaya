"use client";

import { useScope } from "@/components/FilterBar";
import { useStore } from "@/lib/offline/store";
import { membership, rowsInScope, studentsInScope, type CircleOn } from "@/lib/transfers";
import type { RankData } from "@/lib/ranking";
import type { Student } from "@/lib/types";

/**
 * The fixed filter, applied through time (نقل الطلاب): a student counts in the halaqa they were
 * in on each day, so a moved student's past stays with the old halaqa.
 */
export function useHistoryScope(): {
  circleOn: CircleOn;
  /** True once any student has moved: the server can't filter by halaqa for us then. */
  moved: boolean;
  /** The students the filter covers over a period. */
  pool: <S extends Student>(students: S[], from: string, to: string) => S[];
  /** The period's records the filter covers. */
  data: (d: RankData) => RankData;
} {
  const s = useStore();
  const { filter, inScope } = useScope();
  const transfers = s.all("student_transfers");
  const circleOn = membership(s.all("students"), transfers);
  const scoped = filter !== "all";
  return {
    circleOn,
    moved: transfers.length > 0,
    pool: (students, from, to) => (scoped ? studentsInScope(students, transfers, inScope, from, to) : students),
    data: (d) =>
      scoped
        ? {
            quran: rowsInScope(d.quran, (e) => e.entry_date, circleOn, inScope),
            attendance: rowsInScope(d.attendance, (a) => a.att_date, circleOn, inScope),
            tarbiya: rowsInScope(d.tarbiya, (n) => n.record_date, circleOn, inScope),
            activities: d.activities,
            exams: rowsInScope(d.exams ?? [], (x) => x.exam_date, circleOn, inScope),
          }
        : d,
  };
}
