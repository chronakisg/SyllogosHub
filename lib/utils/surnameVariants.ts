// lib/utils/surnameVariants.ts
//
// Greek surname variant generation για family-link matching.
// Η μητέρα ή σύζυγος ενός άντρα συχνά έχει feminine form του ίδιου επιθέτου
// (π.χ. ΚΛΕΙΣΑΡΧΑΚΗΣ ↔ ΚΛΕΙΣΑΡΧΑΚΗ). Auxiliary suggestions για το family
// editor δουλεύουν με αυτό το mapping.

import { normalizeGreek } from "./greekSearch";

/**
 * Επιστρέφει surname variants (normalized form) για lookup.
 *
 * Patterns (operate on normalizeGreek output — final-σ, lowercase):
 *   masculine → feminine        feminine → masculine
 *   -ησ → -η                    -η → -ησ
 *   -οσ → -ου                   -ου → -οσ
 *   -ασ → -α                    -α → -ασ
 *
 * Examples:
 *   surnameVariants("ΚΛΕΙΣΑΡΧΑΚΗΣ") → ["κλεισαρχακησ", "κλεισαρχακη"]
 *   surnameVariants("ΠΑΠΑΔΟΠΟΥΛΟΣ") → ["παπαδοπουλοσ", "παπαδοπουλου"]
 *   surnameVariants("ΔΗΜΑΣ")        → ["δημασ", "δημα"]
 *   surnameVariants("ΚΛΕΙΣΑΡΧΑΚΗ")  → ["κλεισαρχακη", "κλεισαρχακησ"]
 *   surnameVariants("Müller")       → ["müller"] (non-Greek, single entry)
 *   surnameVariants(null)           → []
 *   surnameVariants("")             → []
 *
 * Permissive σε reverse mapping — false positives OK για suggestions
 * (π.χ. "ΝΙΚΗ" επιστρέφει και "ΝΙΚΗΣ" παρόλο που δεν είναι actual surname).
 */
export function surnameVariants(surname: string | null): string[] {
  if (!surname) return [];
  const n = normalizeGreek(surname);
  if (!n) return [];

  // Non-Greek surnames: single entry, no variant generation.
  if (!/[Ͱ-Ͽ]/.test(n)) return [n];

  const variants = new Set<string>([n]);

  // Masculine → feminine
  if (n.endsWith("ησ")) variants.add(n.slice(0, -2) + "η");
  if (n.endsWith("οσ")) variants.add(n.slice(0, -2) + "ου");
  if (n.endsWith("ασ")) variants.add(n.slice(0, -2) + "α");

  // Feminine → masculine
  if (n.endsWith("η")) variants.add(n.slice(0, -1) + "ησ");
  if (n.endsWith("ου")) variants.add(n.slice(0, -2) + "οσ");
  if (n.endsWith("α")) variants.add(n.slice(0, -1) + "ασ");

  return Array.from(variants);
}
