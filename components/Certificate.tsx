"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useStore } from "@/lib/offline/store";
import { juzTitle } from "@/lib/exams";
import type { Exam } from "@/lib/types";

// شهادة إتمام جزء: an A4 landscape certificate for a passed juz' exam, printed (or saved as PDF)
// straight from the browser. Only the certificate is printed: the app is hidden meanwhile.
export default function Certificate({ exam, onClose }: { exam: Exam; onClose: () => void }) {
  const s = useStore();
  const student = s.get("students", exam.student_id);
  const female = s.get("circles", student?.circle_id ?? "")?.section === "FEMALE";
  const g = (m: string, f: string) => (female ? f : m);

  useEffect(() => {
    const done = () => document.body.classList.remove("printing-cert");
    window.addEventListener("afterprint", done);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => {
      done();
      window.removeEventListener("afterprint", done);
      window.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  function print() {
    document.body.classList.add("printing-cert");
    window.print();
  }

  const [y, m, d] = exam.exam_date.split("-").map(Number);
  const when = new Date(y, m - 1, d);
  const hijri = fmt("ar-SA-u-ca-islamic-umalqura", when);
  const greg = fmt("ar-SY", when);

  return createPortal(
    <div className="cert-overlay" role="dialog" aria-label="شهادة إتمام جزء">
      <div className="cert-actions no-print-cert">
        <button onClick={print}>🖨️ طباعة / حفظ PDF</button>
        <button className="secondary" onClick={onClose}>
          إغلاق
        </button>
      </div>
      <div className="cert-scroll">
        <div className="cert-sheet">
          <div className="cert-frame">
            <span className="cert-corner tl" aria-hidden />
            <span className="cert-corner tr" aria-hidden />
            <span className="cert-corner bl" aria-hidden />
            <span className="cert-corner br" aria-hidden />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="cert-logo" src="/images/logo.png" alt="" />
            <div className="cert-center">المركز الثقافي الدعوي في مضايا</div>
            <div className="cert-basmala">بسم الله الرحمن الرحيم</div>
            <h1 className="cert-title">شهادة إتمام حفظ</h1>
            <p className="cert-text">
              يشهد المركز بأنّ {g("الطالب", "الطالبة")}
            </p>
            <div className="cert-name">{student?.name ?? "—"}</div>
            <p className="cert-text">
              {g("قد أتمّ", "قد أتمّت")} حفظ <b>{juzTitle(exam.juz_no ?? 0)}</b> من القرآن الكريم،
              <br />
              {g("واجتاز", "واجتازت")} الاختبار فيه بعلامة <b>{Number(exam.score)}</b> من 100.
            </p>
            <p className="cert-dua">نسأل الله أن {g("يجعله", "يجعلها")} من أهل القرآن الذين هم أهل الله وخاصّته</p>
            <div className="cert-date">
              <span>{hijri}</span>
              <span>الموافق {greg} م</span>
            </div>
            <div className="cert-signs">
              <div>
                <span>المختبِر</span>
                <b>{exam.examiner ?? ""}</b>
                <i />
              </div>
              <div>
                <span>مدير المركز</span>
                <b>&nbsp;</b>
                <i />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function fmt(locale: string, d: Date): string {
  try {
    return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(d);
  } catch {
    return d.toLocaleDateString();
  }
}
