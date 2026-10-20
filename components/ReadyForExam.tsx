"use client";

import { useMemo } from "react";
import { useApp } from "@/components/AppContext";
import { useStore } from "@/lib/offline/store";
import { readyForExam } from "@/lib/exams";
import { setCardIntent } from "@/lib/cardIntent";
import type { Student } from "@/lib/types";

// المرحلة 11: who finished memorizing a whole juz' and hasn't passed its exam yet.
// «سجّل الاختبار» opens their card on the exams tab with that juz' chosen.
export default function ReadyForExam({ students, open }: { students: Student[]; open: (id: string) => void }) {
  const s = useStore();
  const { mushaf } = useApp();
  const quranBy = s.byStudent("quran_entries");
  const exams = s.all("exams");
  const list = useMemo(() => readyForExam(mushaf, students, quranBy, exams), [mushaf, students, quranBy, exams]);
  if (!list.length) return null;

  return (
    <div className="card insight ready-card">
      <h3>🎓 جاهزون للاختبار</h3>
      <p className="muted">أتمّوا حفظ جزء كامل ولم يُختبروا فيه بعد</p>
      <ul className="insight-list">
        {list.map(({ student, juz }) => (
          <li key={`${student.id}-${juz}`}>
            <span className="absent-name" onClick={() => open(student.id)}>
              {student.name} <span className="badge excellent">الجزء {juz}</span>
            </span>
            <button
              className="secondary"
              onClick={() => {
                setCardIntent({ studentId: student.id, tab: "EXAMS", juz });
                open(student.id);
              }}
            >
              سجّل الاختبار
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
