// نقل الطلاب بين الحلقات: which halaqa a student was in on a given day, from the transfers the
// database records whenever a student's halaqa changes. A record counts towards the halaqa the
// student was in on its day, so moving a student doesn't carry their past into the new halaqa.

import type { Student, StudentTransfer } from "@/lib/types";

/** The student's halaqa on a day (their current one when nothing moved them since). */
export type CircleOn = (studentId: string, date: string) => string | undefined;

export function membership(students: Pick<Student, "id" | "circle_id">[], transfers: StudentTransfer[]): CircleOn {
  const current = new Map(students.map((s) => [s.id, s.circle_id]));
  const by = byStudent(transfers);
  return (id, date) => {
    // The first move after that day says where they were before it.
    for (const t of by.get(id) ?? []) if (date < t.transfer_date) return t.from_circle_id ?? current.get(id);
    return current.get(id);
  };
}

/**
 * Students a scope covers over a period: in one of its halaqat on at least one day of it.
 * A student moved out stays in the old halaqa's past periods; one moved in counts from the
 * day of the move.
 */
export function studentsInScope<S extends Pick<Student, "id" | "circle_id">>(
  students: S[],
  transfers: StudentTransfer[],
  inScope: (circleId: string) => boolean,
  from: string,
  to: string
): S[] {
  const by = byStudent(transfers);
  return students.filter((s) => {
    const moves = by.get(s.id);
    if (!moves?.length) return inScope(s.circle_id);
    // Stays: [start, end) per halaqa, the last one open-ended.
    let start = "";
    for (const t of moves) {
      if (t.from_circle_id && inScope(t.from_circle_id) && start <= to && t.transfer_date > from) return true;
      start = t.transfer_date;
    }
    return inScope(s.circle_id) && start <= to;
  });
}

/** Keeps the rows a scope covers: those of a day the student was in one of its halaqat. */
export function rowsInScope<R extends { student_id: string }>(
  rows: R[],
  dateOf: (r: R) => string,
  circleOn: CircleOn,
  inScope: (circleId: string) => boolean
): R[] {
  return rows.filter((r) => {
    const c = circleOn(r.student_id, dateOf(r));
    return !!c && inScope(c);
  });
}

function byStudent(transfers: StudentTransfer[]): Map<string, StudentTransfer[]> {
  const by = new Map<string, StudentTransfer[]>();
  for (const t of transfers) {
    if (t.deleted_at) continue;
    const l = by.get(t.student_id);
    if (l) l.push(t);
    else by.set(t.student_id, [t]);
  }
  for (const l of by.values()) l.sort((a, b) => a.transfer_date.localeCompare(b.transfer_date) || a.created_at.localeCompare(b.created_at));
  return by;
}
