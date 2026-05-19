// lib/enrich/match.ts
//
// Scoring engine για το Member Enrichment Wizard.
// Παίρνει μια NormalizedExcelRow + λίστα members → ranked candidates.
//
// Pure functions, zero DB. Καλείται από το /api/members/enrich/match
// route (Commit 2) αφού έχει φέρει τα members με μία query.
//
// Scoring & thresholds: plan §4.1, §4.2.

import type { Member } from "@/lib/supabase/types";
import { normalizeGreek } from "@/lib/utils/greekSearch";

import { levenshtein } from "./columnMapper";
import { digitsOnly } from "./normalize";
import type {
  MatchCandidate,
  MatchSignal,
  NormalizedExcelRow,
} from "./types";

// ──────────────────────────────────────────────────────────────────
// Constants — scoring weights & thresholds
// ──────────────────────────────────────────────────────────────────

export const SCORE_EMAIL_EXACT = 50;
export const SCORE_PHONE_EXACT = 30;
export const SCORE_LASTNAME_EXACT = 15;
export const SCORE_FIRSTNAME_EXACT = 10;
export const SCORE_FIRSTNAME_FUZZY = 5;
export const SCORE_FATHER_NAME_EXACT = 5;
export const SCORE_ADDRESS_OVERLAP = 5;

/**
 * Καθορίζει αν το candidate εμφανίζεται default-selected στο review
 * panel. ≥ 50 σημαίνει τουλάχιστον email ή lastname+firstname+phone
 * συνδυασμός — strong signal.
 */
export const MATCH_THRESHOLD_PRIMARY = 50;

/**
 * Κάτω από αυτό, το candidate κρύβεται from default list. Admin
 * μπορεί να ψάξει manually μέσω fallback search.
 */
export const MATCH_THRESHOLD_SECONDARY = 25;

/**
 * Hard cap στο 100 — το άθροισμα όλων των signals φτάνει 120 αν
 * όλα χτυπήσουν. Plan §4.1 specifies "0-100" range, οπότε capping
 * για consistency με το spec.
 */
const SCORE_MAX = 100;

// ──────────────────────────────────────────────────────────────────
// MatchableMember
// ──────────────────────────────────────────────────────────────────

/**
 * Supabase `.select(...)` string που μαζεύει ΟΛΑ τα MatchableMember
 * columns σε ένα tuple — single source of truth για match.ts type +
 * match endpoint query. Future column additions: ενημέρωσε ΚΑΙ
 * MatchableMember Pick + αυτό το string ταυτόχρονα.
 */
export const MATCHABLE_SELECT =
  "id, first_name, last_name, email, phone, father_name, address, " +
  "birth_date, birthplace, residence, occupation, mother_name, maiden_name";

/**
 * Subset του Member που χρειάζεται το enrichment wizard:
 * - 7 πρώτα fields: scoring engine (email, phone, ταυτότητα, address overlap)
 * - 6 επόμενα: read-only carry για ReviewCard diff panel
 *   (birth_date / birthplace / residence / occupation / mother_name /
 *   maiden_name) — δεν συμβάλλουν στο scoring αλλά πρέπει να φτάσουν
 *   στο UI για να εμφανιστούν existing values στο "(κενό) → νέα τιμή"
 *
 * Καλώντας `.select(MATCHABLE_SELECT)` αποφεύγουμε over-fetch (members
 * πίνακας έχει >30 columns).
 */
export type MatchableMember = Pick<
  Member,
  | "id"
  | "first_name"
  | "last_name"
  | "email"
  | "phone"
  | "father_name"
  | "address"
  | "birth_date"
  | "birthplace"
  | "residence"
  | "occupation"
  | "mother_name"
  | "maiden_name"
>;

// ──────────────────────────────────────────────────────────────────
// scoreCandidate
// ──────────────────────────────────────────────────────────────────

/**
 * Score έναν candidate member έναντι μιας normalized row.
 *
 * Ζuθμίζει σε εξεταζόμενα signals (plan §4.1):
 *   • email exact (Greek-normalized, ουσιαστικά lowercase για ascii)
 *   • phone exact — οποιαδήποτε row.phones[] vs member.phone (digits-only)
 *   • lastname exact (Greek-normalized)
 *   • firstname exact (Greek-normalized) ή fuzzy (Levenshtein ≤ 2)
 *   • father_name exact (Greek-normalized)
 *   • address token overlap (any token ≥ 3 chars common)
 *
 * Returns score 0..SCORE_MAX, capped.
 */
export function scoreCandidate(
  row: NormalizedExcelRow,
  member: MatchableMember,
): MatchCandidate {
  let score = 0;
  const signals: MatchSignal[] = [];

  const rowEmail = row.values.email ?? null;
  const rowLast = row.values.last_name ?? null;
  const rowFirst = row.values.first_name ?? null;
  const rowFather = row.values.father_name ?? null;
  const rowAddress = row.values.address ?? null;

  // Email
  if (rowEmail && member.email) {
    if (normalizeGreek(rowEmail) === normalizeGreek(member.email)) {
      score += SCORE_EMAIL_EXACT;
      signals.push("email_exact");
    }
  }

  // Phone — οποιαδήποτε από row.phones ισούται με digitsOnly(member.phone)
  if (row.phones.length > 0 && member.phone) {
    const memberPhone = digitsOnly(member.phone);
    if (memberPhone && row.phones.some((p) => p === memberPhone)) {
      score += SCORE_PHONE_EXACT;
      signals.push("phone_exact");
    }
  }

  // Lastname
  if (rowLast && member.last_name) {
    if (normalizeGreek(rowLast) === normalizeGreek(member.last_name)) {
      score += SCORE_LASTNAME_EXACT;
      signals.push("lastname_exact");
    }
  }

  // Firstname — exact πρώτα, fuzzy fallback (NOT both)
  if (rowFirst && member.first_name) {
    const a = normalizeGreek(rowFirst);
    const b = normalizeGreek(member.first_name);
    if (a === b) {
      score += SCORE_FIRSTNAME_EXACT;
      signals.push("firstname_exact");
    } else if (levenshtein(a, b) <= 2) {
      score += SCORE_FIRSTNAME_FUZZY;
      signals.push("firstname_fuzzy");
    }
  }

  // Father name
  if (rowFather && member.father_name) {
    if (normalizeGreek(rowFather) === normalizeGreek(member.father_name)) {
      score += SCORE_FATHER_NAME_EXACT;
      signals.push("father_name_exact");
    }
  }

  // Address token overlap
  if (rowAddress && member.address) {
    const rowTokens = tokenize(rowAddress);
    const memberTokens = new Set(tokenize(member.address));
    if (rowTokens.some((t) => memberTokens.has(t))) {
      score += SCORE_ADDRESS_OVERLAP;
      signals.push("address_overlap");
    }
  }

  return {
    memberId: member.id,
    // Signals sum max 120, capped to 100 για UI clarity
    // — see MEMBER_ENRICH_PLAN.md §4.1
    score: Math.min(SCORE_MAX, score),
    signals,
  };
}

// ──────────────────────────────────────────────────────────────────
// rankCandidates
// ──────────────────────────────────────────────────────────────────

/**
 * Επιστρέφει όλους τους candidates ταξινομημένους κατά score desc.
 * Filters out όσους έχουν score == 0 (irrelevant — όχι signals).
 *
 * Το threshold filtering (primary vs secondary visibility) γίνεται
 * από το API/UI layer με βάση τις εξαγόμενες σταθερές.
 */
export function rankCandidates(
  row: NormalizedExcelRow,
  members: MatchableMember[],
): MatchCandidate[] {
  return members
    .map((m) => scoreCandidate(row, m))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);
}

// ──────────────────────────────────────────────────────────────────
// tokenize — internal helper για address overlap
// ──────────────────────────────────────────────────────────────────

/**
 * Σπάει string σε normalized tokens (≥ 3 chars). Διατηρεί μόνο
 * letters/digits — strips κόμματα, παύλες, αριθμούς διεύθυνσης ως
 * separate tokens κλπ.
 *
 * Threshold 3 chars αποφεύγει spurious matches σε connectors ("ΟΔ",
 * "ΑΡ.", numbers < 100).
 */
function tokenize(s: string): string[] {
  return normalizeGreek(s)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 3);
}
