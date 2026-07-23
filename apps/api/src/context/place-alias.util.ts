/**
 * Normalizes a place alias / free-text fragment for deterministic matching.
 *
 * Handles both English and Arabic: lowercases, strips combining marks (Latin
 * accents + Arabic harakat), folds common Arabic letter variants (alef/ta-marbuta/
 * alef-maqsura), removes the Arabic definite article "ال" prefix, drops
 * punctuation, and collapses whitespace. Two aliases that a human would read as
 * the same place normalize to the same string (e.g. "الجامعة" and "جامعة").
 */
export function normalizeAlias(value: string): string {
  if (typeof value !== 'string') return '';
  let text = value
    .toLowerCase()
    .normalize('NFKD')
    // Strip combining marks (Latin accents + Arabic harakat/tashkeel).
    .replace(/\p{M}+/gu, '');

  // Fold common Arabic letter variants to a canonical form.
  text = text
    .replace(/[آأإٱ]/g, 'ا') // آ أ إ ٱ -> ا
    .replace(/ة/g, 'ه') // ة -> ه
    .replace(/ى/g, 'ي') // ى -> ي
    .replace(/ؤ/g, 'و') // ؤ -> و
    .replace(/ئ/g, 'ي'); // ئ -> ي

  text = text
    // Drop everything that isn't a letter, number, or whitespace.
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Remove a leading Arabic definite article "ال" so "الجامعة" matches "جامعة".
  text = text.replace(/(^|\s)ال(?=\p{L})/gu, '$1').trim();

  return text;
}

/**
 * Returns true when `haystackText` mentions `normalizedAlias` as a whole
 * word/phrase. Both sides are normalized; matching is word-boundary aware for
 * single tokens and substring-based for multi-word aliases so "gym" doesn't hit
 * "gymnasium prep" spuriously while "coffee shop" still matches inside a
 * sentence.
 */
export function textContainsAlias(
  haystackText: string,
  normalizedAlias: string,
): boolean {
  const normalizedHaystack = normalizeAlias(haystackText);
  if (!normalizedAlias || !normalizedHaystack) return false;

  if (normalizedAlias.includes(' ')) {
    return normalizedHaystack.includes(normalizedAlias);
  }

  // Single token: require a whole-word match.
  const tokens = normalizedHaystack.split(' ');
  return tokens.includes(normalizedAlias);
}
