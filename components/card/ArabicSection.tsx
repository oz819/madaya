"use client";

import { useState } from "react";
import { useApp } from "@/components/AppContext";
import { confirmDialog } from "@/components/ConfirmDialog";
import { store, newId, useStore } from "@/lib/offline/store";
import { byNewest } from "@/lib/progress";
import { QUALITIES, todayStr, type ArabicEnrollment, type ArabicEntry } from "@/lib/types";

// Arabic track, page-based (spec §4.4): enrollment in a book plus page-range entries.
export default function ArabicSection({
  studentId,
  enrollments,
  entries,
}: {
  studentId: string;
  enrollments: ArabicEnrollment[];
  entries: ArabicEntry[];
}) {
  const s = useStore();
  const { showToast } = useApp();
  const books = s.all("arabic_books").filter((b) => b.active);
  const active = enrollments.filter((e) => !e.deleted_at && !e.finished_on);
  const [bookId, setBookId] = useState(active[0]?.book_id ?? "");
  const book = s.get("arabic_books", bookId);
  const forBook = entries.filter((e) => e.book_id === bookId).sort(byNewest((e) => e.entry_date));
  const lastPage = forBook.reduce((m, e) => Math.max(m, e.to_page), 0);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [fromPage, setFromPage] = useState(lastPage + 1 || 1);
  const [toPage, setToPage] = useState(lastPage + 1 || 1);
  const [date, setDate] = useState(todayStr());
  const [quality, setQuality] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [enrollBook, setEnrollBook] = useState("");

  function reset(next = lastPage) {
    setEditingId(null);
    setFromPage(next + 1);
    setToPage(next + 1);
    setDate(todayStr());
    setQuality("");
    setNotes("");
    setError("");
  }

  // A book the student is studying now, or one they already finished (e.g. before the app).
  async function enroll(finished: boolean) {
    if (!enrollBook) return;
    const existing = enrollments.find((e) => e.book_id === enrollBook);
    await store.save(
      "student_arabic_enrollments",
      {
        id: existing?.id ?? newId(),
        student_id: studentId,
        book_id: enrollBook,
        started_on: todayStr(),
        finished_on: finished ? todayStr() : null,
        deleted_at: null,
      },
      finished ? "تسجيل كتاب عربية منتهٍ" : "تسجيل في كتاب عربية"
    );
    if (!finished) {
      setBookId(enrollBook);
      reset(0);
    }
    setEnrollBook("");
    showToast(finished ? "سُجّل الكتاب كمنتهٍ" : "تم التسجيل في الكتاب");
  }

  async function setFinished(en: ArabicEnrollment, finished: boolean) {
    const title = s.get("arabic_books", en.book_id)?.title ?? "";
    const ok = await confirmDialog({
      title: finished ? `إنهاء كتاب «${title}»؟` : `إرجاع «${title}» إلى «يدرسه»؟`,
      body: finished ? "يُسجَّل أن الطالب أنهى الكتاب اليوم، ويبقى ظاهرًا في كتب الطالب." : "يعود الكتاب إلى الكتب التي يدرسها الطالب الآن.",
      ok: finished ? "إنهاء" : "إرجاع",
    });
    if (!ok) return;
    await store.save(
      "student_arabic_enrollments",
      { ...en, finished_on: finished ? todayStr() : null },
      finished ? "إنهاء كتاب عربية" : "إرجاع كتاب عربية"
    );
    if (finished && en.book_id === bookId) setBookId(active.find((a) => a.id !== en.id)?.book_id ?? "");
    if (!finished && !book) setBookId(en.book_id);
    showToast(finished ? `أنهى «${title}»` : `«${title}»: يدرسه`);
  }

  async function save() {
    if (!book) return setError("اختر الكتاب");
    if (fromPage < 1 || toPage < fromPage || toPage > book.total_pages) {
      return setError(`رقم الصفحة خارج حدود الكتاب (${book.total_pages} صفحة)`);
    }
    await store.save(
      "arabic_entries",
      {
        id: editingId ?? newId(),
        student_id: studentId,
        book_id: book.id,
        entry_date: date,
        from_page: fromPage,
        to_page: toPage,
        quality: quality || null,
        notes: notes.trim() || null,
        deleted_at: null,
      },
      `العربية: ص ${fromPage}–${toPage}`
    );
    if (!editingId) await store.ensurePresent(studentId, date);
    showToast(editingId ? "تم التعديل" : "تم حفظ درس العربية");
    reset(Math.max(lastPage, toPage));
  }

  function startEdit(e: ArabicEntry) {
    setEditingId(e.id);
    setFromPage(e.from_page);
    setToPage(e.to_page);
    setDate(e.entry_date);
    setQuality(e.quality ?? "");
    setNotes(e.notes ?? "");
  }

  async function remove(e: ArabicEntry) {
    const who = s.get("students", studentId)?.name ?? "";
    const ok = await confirmDialog({
      title: `حذف درس العربية «${who}»؟`,
      body: `${e.entry_date} · ${s.get("arabic_books", e.book_id)?.title ?? ""} ص${e.from_page}–${e.to_page}\n` + "ينتقل إلى سجل المحذوفات، ويستطيع المدير استرجاعه من هناك.",
      ok: "حذف",
      danger: true,
    });
    if (!ok) return;
    await store.softDelete("arabic_entries", e.id, "حذف درس عربية");
  }

  const mine = enrollments
    .filter((e) => !e.deleted_at)
    .sort((a, b) => Number(!!a.finished_on) - Number(!!b.finished_on) || b.started_on.localeCompare(a.started_on));
  const notEnrolled = books.filter((b) => !mine.some((e) => e.book_id === b.id));

  return (
    <div className="track">
      {mine.length > 0 && (
        <div className="book-status">
          <label>كتب الطالب</label>
          <ul className="history">
            {mine.map((en) => (
              <li key={en.id}>
                <div>
                  <b>{s.get("arabic_books", en.book_id)?.title ?? "—"}</b>
                  {en.finished_on ? (
                    <span className="badge excellent">✅ أنهاه · {en.finished_on}</span>
                  ) : (
                    <span className="badge warn">📖 يدرسه · منذ {en.started_on}</span>
                  )}
                </div>
                <button className="link" onClick={() => setFinished(en, !en.finished_on)}>
                  {en.finished_on ? "إرجاع لـ «يدرسه»" : "✅ أنهى الكتاب"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {active.length > 0 && (
        <div className="formgrid compact">
          <div>
            <label>الكتاب</label>
            <select value={bookId} onChange={(e) => (setBookId(e.target.value), reset(0))}>
              {active.map((en) => (
                <option key={en.id} value={en.book_id}>
                  {s.get("arabic_books", en.book_id)?.title ?? "—"}
                </option>
              ))}
            </select>
          </div>
          {book && (
            <div>
              <label>التقدّم</label>
              <div className="progress">
                <i style={{ width: `${Math.round((lastPage / book.total_pages) * 100)}%` }} />
              </div>
              <span className="small">
                ص {lastPage} / {book.total_pages} ({Math.round((lastPage / book.total_pages) * 100)}%)
              </span>
            </div>
          )}
        </div>
      )}

      {book && (
        <div className="entry-form">
          <div className="formgrid compact">
            <div>
              <label>من صفحة</label>
              <input type="number" inputMode="numeric" min={1} max={book.total_pages} value={fromPage || ""} onChange={(e) => setFromPage(Number(e.target.value))} />
            </div>
            <div>
              <label>إلى صفحة</label>
              <input type="number" inputMode="numeric" min={1} max={book.total_pages} value={toPage || ""} onChange={(e) => setToPage(Number(e.target.value))} />
            </div>
            <div>
              <label>التاريخ</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label>التقدير</label>
              <select value={quality} onChange={(e) => setQuality(e.target.value)}>
                <option value="">—</option>
                {QUALITIES.map((q) => (
                  <option key={q}>{q}</option>
                ))}
              </select>
            </div>
            <div className="wide">
              <label>ملاحظة</label>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <div className="row-actions">
            <button onClick={save}>{editingId ? "حفظ التعديل" : "إضافة درس"}</button>
            {editingId && (
              <button className="secondary" onClick={() => reset()}>
                إلغاء
              </button>
            )}
          </div>
          {error && <p className="error-text">{error}</p>}
          <ul className="history">
            {forBook.slice(0, 8).map((e) => (
              <li key={e.id}>
                <div>
                  <b>
                    ص {e.from_page}–{e.to_page}
                  </b>
                  <span className="muted"> · {e.entry_date}</span>
                  {e.quality && <span className="badge">{e.quality}</span>}
                  {e.notes && <div className="small muted">{e.notes}</div>}
                </div>
                <div className="row-actions">
                  <button className="link" onClick={() => startEdit(e)}>
                    تعديل
                  </button>
                  <button className="link danger-link" onClick={() => remove(e)}>
                    حذف
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {notEnrolled.length > 0 && (
        <div className="row-actions" style={{ marginTop: 8 }}>
          <select value={enrollBook} onChange={(e) => setEnrollBook(e.target.value)} style={{ maxWidth: 260 }}>
            <option value="">إضافة كتاب للطالب…</option>
            {notEnrolled.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title} ({b.total_pages} ص)
              </option>
            ))}
          </select>
          <button className="secondary" onClick={() => enroll(false)} disabled={!enrollBook}>
            📖 يدرسه
          </button>
          <button className="secondary" onClick={() => enroll(true)} disabled={!enrollBook}>
            ✅ أنهاه
          </button>
        </div>
      )}
      {!books.length && <p className="muted">لا توجد كتب عربية بعد. يضيفها المدير من شاشة الإدارة.</p>}
    </div>
  );
}
