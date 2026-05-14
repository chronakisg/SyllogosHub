/**
 * Transliterate Greek text to Latin slug.
 *
 * Output matches server-side SLUG_RE regex from
 * app/api/admin/clubs/route.ts: ^[a-z0-9]+(-[a-z0-9]+)*$
 *
 * Conventions:
 * - Phonetic-ish Greek transliteration (γ→g, η→i, υ→y, χ→ch, ψ→ps)
 * - All output lowercase
 * - Non-alphanumeric collapsed to single hyphen
 * - Leading/trailing hyphens trimmed
 *
 * Examples:
 *   "ΣΥΛΛΟΓΟΣ ΔΟΚΙΜΗΣ"        → "syllogos-dokimis"
 *   "Ένωση Κρητών Αιγάλεω"    → "enosi-kriton-aigaleo"
 *   "Σύλλογος   --  Test  "  → "syllogos-test"
 *   "Παρα$ιτο 123!"          → "parasito-123"
 *   ""                       → ""
 */

const GREEK_TO_LATIN: Record<string, string> = {
  α: "a",
  β: "v",
  γ: "g",
  δ: "d",
  ε: "e",
  ζ: "z",
  η: "i",
  θ: "th",
  ι: "i",
  κ: "k",
  λ: "l",
  μ: "m",
  ν: "n",
  ξ: "x",
  ο: "o",
  π: "p",
  ρ: "r",
  σ: "s",
  ς: "s",
  τ: "t",
  υ: "y",
  φ: "f",
  χ: "ch",
  ψ: "ps",
  ω: "o",
};

export function slugify(input: string): string {
  if (!input) return "";

  // 1. Normalize + strip diacritics (NFD decomposes "ώ" → "ω" + tonos mark)
  let s = input.normalize("NFD").replace(/\p{M}/gu, "");

  // 2. Lowercase (after diacritic strip ώστε να μην ξεφύγει η Greek casing)
  s = s.toLowerCase();

  // 3. Greek → Latin via lookup map
  s = s
    .split("")
    .map((c) => GREEK_TO_LATIN[c] ?? c)
    .join("");

  // 4. Replace non-alphanumeric runs με single '-'
  s = s.replace(/[^a-z0-9]+/g, "-");

  // 5. Trim leading/trailing hyphens
  s = s.replace(/^-+|-+$/g, "");

  return s;
}
