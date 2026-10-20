// A one-shot request for the next student card that opens: which tab, and what to start the
// form on (e.g. «سجّل الاختبار» for a juz' from the home page). The card reads it once.

export type CardIntent = { studentId: string; tab: "EXAMS"; juz?: number };

let pending: CardIntent | null = null;

export function setCardIntent(intent: CardIntent) {
  pending = intent;
}

export function takeCardIntent(studentId: string): CardIntent | null {
  if (pending?.studentId !== studentId) return null;
  const i = pending;
  pending = null;
  return i;
}
