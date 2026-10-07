// Arabic-normalized matching for name search (spec §5.1): ignore diacritics/tatweel, hamza and
// alef variants, taa marbuta vs haa, and alef maqsura vs yaa.
export function normalizeArabic(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ء/g, "")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function matchesName(name: string, query: string): boolean {
  const q = normalizeArabic(query);
  return !q || normalizeArabic(name).includes(q);
}
