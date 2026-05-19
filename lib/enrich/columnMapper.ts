// lib/enrich/columnMapper.ts
//
// Auto-detect mapping μεταξύ Excel column headers και SyllogosHub
// member fields. Greek-normalized exact match πρώτα, Levenshtein ≤ 2
// fuzzy fallback (plan §3.1).
//
// Pure functions — zero IO. Reuses lib/utils/greekSearch.

import { normalizeGreek } from "@/lib/utils/greekSearch";

import type { ColumnTarget, MappedColumn } from "./types";

// ──────────────────────────────────────────────────────────────────
// Known aliases per target field
// ──────────────────────────────────────────────────────────────────

/**
 * Known headers ανά target field. ΟΛΕΣ οι aliases περνούν από
 * normalizeGreek (lowercase + diacritics-strip + ς→σ) πριν compared,
 * άρα γράφονται plain — no need to enumerate "ΕΠΩΝΥΜΟ"/"Επώνυμο"/
 * "Επωνυμο" separately.
 *
 * Covers το spec list από plan §3.1 + έξτρα variants που εντοπίστηκαν
 * σε real-world έντυπα συλλόγου.
 */
const ALIASES: Record<Exclude<ColumnTarget, "ignore">, string[]> = {
  last_name: ["επωνυμο", "επιθετο", "last name", "lastname", "surname"],
  first_name: ["ονομα", "first name", "firstname"],
  phone: [
    "τηλεφωνο",
    "τηλ",
    "κινητο",
    "phone",
    "mobile",
    "tel",
    "tηλεφωνα",
    "τηλεφωνα",
  ],
  email: [
    "email",
    "e-mail",
    "e mail",
    "ηλεκτρονικη διευθυνση",
    "ηλεκτρονικο ταχυδρομειο",
  ],
  address: ["διευθυνση", "address", "οδος"],
  birth_date: [
    "ημερομηνια γεννησης",
    "ημ/νια γεννησης",
    "ημνια γεννησης",
    "date of birth",
    "dob",
    "γεννηση",
  ],
  birthplace: ["τοπος γεννησης", "birthplace", "place of birth"],
  residence: ["τοπος κατοικιας", "πολη", "residence", "city"],
  occupation: ["επαγγελμα", "occupation", "job"],
  father_name: [
    "ονομα πατρος",
    "ονομα πατερα",
    "πατρος",
    "πατερας",
    "πατρωνυμο",
    "father name",
    "father",
  ],
  mother_name: [
    "ονομα μητρος",
    "ονομα μητερας",
    "μητρος",
    "μητερα",
    "μητρωνυμο",
    "mother name",
    "mother",
  ],
  maiden_name: [
    "γενος",
    "πατρικο επωνυμο",
    "πατρικο",
    "maiden name",
    "maiden",
  ],
};

// Pre-compute normalized aliases για micro-perf (κληθεί 1x ανά header
// κατά το upload — minimal load, αλλά still nicer).
const NORMALIZED_ALIASES: Array<{
  target: Exclude<ColumnTarget, "ignore">;
  alias: string;
}> = Object.entries(ALIASES).flatMap(([target, aliases]) =>
  aliases.map((alias) => ({
    target: target as Exclude<ColumnTarget, "ignore">,
    alias: normalizeGreek(alias),
  })),
);

// ──────────────────────────────────────────────────────────────────
// autoDetectMapping
// ──────────────────────────────────────────────────────────────────

/**
 * Παράγει το initial mapping suggestion για όλα τα Excel headers.
 *
 * Strategy ανά header (plan §3.1):
 *   1. Greek-normalized exact match σε known alias → autoDetected: true
 *   2. Levenshtein ≤ 2 σε known alias → autoDetected: true
 *   3. otherwise → 'ignore', autoDetected: false (admin choose ή skip)
 *
 * Empty headers (πχ trailing columns χωρίς όνομα) παραλείπονται entirely.
 *
 * Σημείωση: αν 2 Excel columns auto-detect σε ίδιο target (πχ 2 phone
 * columns "ΣΤΑΘΕΡΟ", "ΚΙΝΗΤΟ"), και τα 2 mapped σε 'phone' — admin θα
 * πρέπει να ξεκαθαρίσει στο dropdown. ΔΕΝ deduplicate-άρουμε εδώ.
 */
export function autoDetectMapping(headers: string[]): MappedColumn[] {
  const mapped: MappedColumn[] = [];
  for (const header of headers) {
    if (!header || header.trim() === "") continue;
    const target = detectTarget(header);
    mapped.push({
      excelHeader: header,
      target: target ?? "ignore",
      autoDetected: target !== null,
    });
  }
  return mapped;
}

function detectTarget(
  header: string,
): Exclude<ColumnTarget, "ignore"> | null {
  const norm = normalizeGreek(header);

  // 1. Exact match (post-normalization)
  for (const { target, alias } of NORMALIZED_ALIASES) {
    if (alias === norm) return target;
  }

  // 2. Fuzzy fallback (Levenshtein ≤ 2 — plan §3.1)
  let bestTarget: Exclude<ColumnTarget, "ignore"> | null = null;
  let bestDist = Infinity;
  for (const { target, alias } of NORMALIZED_ALIASES) {
    const dist = levenshtein(norm, alias);
    if (dist < bestDist) {
      bestDist = dist;
      bestTarget = target;
    }
  }
  return bestDist <= 2 ? bestTarget : null;
}

// ──────────────────────────────────────────────────────────────────
// levenshtein
// ──────────────────────────────────────────────────────────────────

/**
 * Standard Levenshtein edit distance. Iterative O(n*m), 1-row rolling
 * buffer για O(min(n,m)) memory.
 *
 * Exported γιατί χρησιμοποιείται και στο match.ts για firstname fuzzy
 * matching (plan §4.1 — "Firstname fuzzy ≤ 2").
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Πάντα swap ώστε b να είναι το shorter — μικρότερο row buffer.
  if (a.length < b.length) {
    const tmp = a;
    a = b;
    b = tmp;
  }

  const prev = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    let prevDiag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      prev[j] = Math.min(
        prev[j] + 1, // deletion
        prev[j - 1] + 1, // insertion
        prevDiag + cost, // substitution
      );
      prevDiag = tmp;
    }
  }

  return prev[b.length];
}
