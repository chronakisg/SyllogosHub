// lib/utils/greekSearch.ts
//
// Greek search normalization για case-insensitive +
// accent-insensitive string matching.
//
// Χρησιμοποιείται σε όλα τα search inputs του project όπου
// ο user πληκτρολογεί ελληνικά (π.χ. /members, /audit-log).
//
// Δύο normalizations:
// 1. Final sigma (ς → σ): "ΚΛΕΙΣ" matches "ΚΛΕΙΣΑΡΧΑΚΗΣ"
// 2. Diacritics stripping: "γιωργος" matches "Γιώργος"

/**
 * Normalize Greek text για search matching.
 *
 * @example
 *   normalizeGreek("ΚΛΕΙΣ") === "κλεισ"
 *   normalizeGreek("Γιώργος") === "γιωργοσ"
 *   normalizeGreek("ΚΛΕΙΣΑΡΧΑΚΗΣ").includes(normalizeGreek("ΚΛΕΙΣ")) === true
 *   normalizeGreek("Γιώργος").includes(normalizeGreek("γιωργος")) === true
 */
export function normalizeGreek(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/ς/g, "σ");
}

/**
 * Greek uppercase normalization για civil-records convention.
 * - Converts to locale-aware Greek uppercase (ς → Σ, σ → Σ, etc.)
 * - Strips tonos (ή → Η) + dialytika (ϊ → Ι)
 * - NFC re-compose για clean output
 *
 * Idempotent: already-uppercase strings pass through unchanged
 * (modulo accent stripping).
 *
 * Examples:
 *   "Παπαδόπουλος"  → "ΠΑΠΑΔΟΠΟΥΛΟΣ"
 *   "ΑΪΒΑΖΟΒΣΚΙ"    → "ΑΙΒΑΖΟΒΣΚΙ"
 *   "ΑΘΑΝΑΣΑΚΗΣ "   → "ΑΘΑΝΑΣΑΚΗΣ " (trim is caller's responsibility)
 */
export function toUpperCaseGreek(s: string): string {
  return s
    .toLocaleUpperCase("el")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .normalize("NFC");
}
