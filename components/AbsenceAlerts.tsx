"use client";

import { useMemo } from "react";
import { useApp } from "@/components/AppContext";
import { store, useStore } from "@/lib/offline/store";
import { useRankingSettings } from "@/lib/rankingSettings";
import { absenceMessage } from "@/lib/familyMessages";
import { waLink } from "@/lib/guardian";
import { todayStr, type Attendance, type Student } from "@/lib/types";

export type AbsentStudent = { student: Student; days: number; since: string };

/** Students absent on their last N recorded days or more (N from the settings), longest first. */
export function useAbsentStudents(students: Student[]): AbsentStudent[] {
  const s = useStore();
  const { supabase } = useApp();
  const { absenceThreshold } = useRankingSettings(supabase);
  const attBy = s.byStudent("attendance");
  return useMemo(
    () =>
      students
        .map((student) => ({ student, ...absenceStreak(attBy.get(student.id)) }))
        .filter((x) => x.days >= absenceThreshold)
        .sort((a, b) => b.days - a.days || a.student.name.localeCompare(b.student.name, "ar")),
    [students, attBy, absenceThreshold]
  );
}

/** How many of the latest recorded days in a row were absences, and the first of them. */
export function absenceStreak(rows: Attendance[] | undefined): { days: number; since: string } {
  const sorted = [...(rows ?? [])].filter((r) => !r.deleted_at).sort((a, b) => b.att_date.localeCompare(a.att_date));
  let days = 0;
  let since = "";
  for (const r of sorted) {
    if (r.status !== "ABSENT") break;
    days++;
    since = r.att_date;
  }
  return { days, since };
}

// تنبيه الغياب: who needs a call, and a kind ready-made message to their family on WhatsApp.
// Sending marks it (synced) so the other teachers know the family was contacted.
export default function AbsenceAlerts({ students, open }: { students: Student[]; open: (id: string) => void }) {
  const s = useStore();
  const { supabase } = useApp();
  const settings = useRankingSettings(supabase);
  const absent = useAbsentStudents(students);
  if (!absent.length) return null;

  const contacted = (a: AbsentStudent) =>
    s.all("report_sends").some((r) => r.student_id === a.student.id && r.kind === "ABSENCE" && !r.deleted_at && r.send_date >= a.since);

  return (
    <div className="card insight warn-card absence-alerts">
      <h3>⚠️ تنبيه الغياب</h3>
      <p className="muted">غابوا آخر {settings.absenceThreshold} أيام مسجّلة متتالية أو أكثر</p>
      <ul className="insight-list">
        {absent.map((a) => {
          const female = s.get("circles", a.student.circle_id)?.section === "FEMALE";
          const msg = absenceMessage(settings.absenceMessage ?? "", a.student, a.days, female);
          const done = contacted(a);
          return (
            <li key={a.student.id}>
              <span className="absent-name" onClick={() => open(a.student.id)}>
                {a.student.name} <span className="badge redo">{a.days} أيام</span>
              </span>
              {done ? (
                <span className="badge excellent">✓ تواصلنا</span>
              ) : (
                <a
                  className="btn small secondary"
                  href={waLink(msg, a.student.guardian_phone)}
                  target="_blank"
                  rel="noreferrer"
                  title={a.student.guardian_phone ? undefined : "لا يوجد رقم لولي الأمر — اختر جهة الاتصال في واتساب"}
                  onClick={() =>
                    store.save(
                      "report_sends",
                      { student_id: a.student.id, send_date: todayStr(), kind: "ABSENCE", deleted_at: null },
                      `رسالة غياب: ${a.student.name}`
                    )
                  }
                >
                  💬 رسالة للأهل{a.student.guardian_phone ? "" : " ⚠️"}
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
