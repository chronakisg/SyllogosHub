// lib/enrich/autoDecision.ts
//
// Pure helper για το pre-population των initial decisions στο
// MATCH_LOADED reducer case. Κρατάει το logic έξω από το reducer
// (που είναι state-machine pure) και έξω από το ReviewCard (που είναι
// React render component). Τρίτο home — shared library — επιτρέπει
// το ίδιο computation σε:
//   - reducer (Commit 4b): seed decisions Map at match-time
//   - UI auto-tick recompute (D5): όταν admin αλλάζει candidate
//     mid-review, recomputed via ReviewCard.computeAutoTicks (sister
//     logic — DRY tracked).
//
// Zero IO. Single export: buildInitialDecision.

import {
  MATCH_THRESHOLD_PRIMARY,
  type MatchableMember,
} from "./match";
import {
  ENRICH_FIELDS,
  type EnrichField,
  type EnrichmentDecision,
  type MatchCandidate,
  type NormalizedExcelRow,
} from "./types";

/**
 * Computes initial auto-decision για μια row, αν υπάρχει high-confidence
 * candidate (score ≥ MATCH_THRESHOLD_PRIMARY = 50) ΚΑΙ τουλάχιστον ένα
 * field θα γίνει auto-ticked.
 *
 * Returns `undefined` αν:
 *   - Δεν υπάρχουν candidates
 *   - Top candidate κάτω από primary threshold
 *   - Member δεν βρίσκεται στο allMembers snapshot (defensive)
 *   - Κάθε excel field είναι empty (nothing to enrich)
 *   - Κάθε existing member field είναι already populated (nothing to overwrite
 *     — auto-tick respects empty-existing rule + email fill-only)
 *
 * Auto-tick rule (plan §3 + locked Q2):
 *   - Excel value non-empty
 *   - Existing member value is null/empty
 *   - Email special: NEVER tick αν existing email non-empty (defense-in-depth
 *     με API server-side enforcement)
 */
export function buildInitialDecision(
  rowIndex: number,
  normalizedRow: NormalizedExcelRow,
  candidates: MatchCandidate[],
  allMembers: MatchableMember[],
): EnrichmentDecision | undefined {
  const top = candidates[0];
  if (!top || top.score < MATCH_THRESHOLD_PRIMARY) return undefined;

  const member = allMembers.find((m) => m.id === top.memberId);
  if (!member) return undefined;

  const fieldUpdates: Partial<Record<EnrichField, string | null>> = {};

  for (const field of ENRICH_FIELDS) {
    const excelValue = normalizedRow.values[field];
    if (excelValue === null || excelValue === undefined || excelValue === "") {
      continue;
    }

    const existingValue = (member as unknown as Record<string, unknown>)[field];
    const isEmpty =
      existingValue === null ||
      existingValue === undefined ||
      existingValue === "";

    // Email fill-only: never auto-set αν existing has value
    if (field === "email" && !isEmpty) continue;

    // Only auto-tick για empty existing
    if (!isEmpty) continue;

    fieldUpdates[field] = excelValue;
  }

  // Αν τίποτα δεν θα γίνει enriched, όχι "apply" — η row μένει undecided
  // ώστε ο admin να εμπλακεί ρητά αν θέλει να κάνει override.
  if (Object.keys(fieldUpdates).length === 0) return undefined;

  return {
    kind: "apply",
    rowIndex,
    memberId: top.memberId,
    fieldUpdates,
  };
}
