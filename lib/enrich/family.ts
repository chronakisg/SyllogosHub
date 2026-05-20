// lib/enrich/family.ts
//
// Family-of detection για το Member Enrichment Wizard.
// Παίρνει μια NormalizedExcelRow + λίστα members → top-N family hints
// για annotation στο skipped CSV (στήλη _likely_family_of).
//
// Pure functions, zero DB. Καλείται από το /api/members/enrich/match
// route parallel του rankCandidates, στην ίδια per-row loop iteration.
//
// 5 heuristic rules + thresholds: see MEMBER_ENRICH_FAMILY_PLAN.md §3.
// Reuse:
//   - normalizeGreek από lib/utils/greekSearch (case/accent tolerance)
//   - tokenize από ./match (single source of truth για address tokens)
//   - digitsOnly από ./normalize (phone normalization)

import { normalizeGreek } from "@/lib/utils/greekSearch";

import { tokenize, type MatchableMember } from "./match";
import { digitsOnly } from "./normalize";
import type { NormalizedExcelRow } from "./types";

// ──────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────

export type FamilySignal =
  | "surname_address"
  | "address_phone"
  | "father_name_match"
  | "mother_name_match"
  | "firstname_matches_member_mother";

export type FamilyHint = {
  memberId: string;
  /** "LASTNAME FIRSTNAME" pre-formatted server-side για CSV rendering. */
  memberName: string;
  score: number;
  signals: FamilySignal[];
};

// ──────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────

const SCORE_PER_SIGNAL = 50;
const TOP_N_FAMILY_HINTS = 3;

/**
 * Minimum score για inclusion. Currently ίσο με SCORE_PER_SIGNAL (any
 * single rule firing admits the member). Preserved as named constant για
 * future tuning όταν rules αποκτήσουν weighted scores.
 */
export const FAMILY_HINT_THRESHOLD = SCORE_PER_SIGNAL;

// ──────────────────────────────────────────────────────────────────
// Helpers (internal, pure)
// ──────────────────────────────────────────────────────────────────

function namesEqual(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!a || !b) return false;
  return normalizeGreek(a) === normalizeGreek(b);
}

function tokenizedAddressesOverlap(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!a || !b) return false;
  const ta = tokenize(a);
  const tb = new Set(tokenize(b));
  return ta.some((t) => tb.has(t));
}

function phonesEqual(
  rowPhones: string[],
  memberPhone: string | null | undefined,
): boolean {
  if (!memberPhone) return false;
  const normalized = digitsOnly(memberPhone);
  if (!normalized) return false;
  return rowPhones.includes(normalized);
}

// ──────────────────────────────────────────────────────────────────
// Per-member detection
// ──────────────────────────────────────────────────────────────────

function detectFamilyHintForMember(
  row: NormalizedExcelRow,
  member: MatchableMember,
): FamilyHint | null {
  const signals: FamilySignal[] = [];

  const rowLastName = row.values.last_name;
  const rowFirstName = row.values.first_name;
  const rowAddress = row.values.address;
  const rowFatherName = row.values.father_name;
  const rowMotherName = row.values.mother_name;

  const lastnameMatch = namesEqual(rowLastName, member.last_name);
  const addressMatch = tokenizedAddressesOverlap(rowAddress, member.address);
  const phoneMatch = phonesEqual(row.phones, member.phone);

  // R1 — surname + address: spouse, sibling, ή child living at home
  if (lastnameMatch && addressMatch) {
    signals.push("surname_address");
  }

  // R2 — address + phone: cohabiting family (landline shared)
  if (addressMatch && phoneMatch) {
    signals.push("address_phone");
  }

  // R3 — row's father_name == this member's first_name (+ lastname)
  // Suggests: row is a child of this member.
  if (
    rowFatherName &&
    namesEqual(rowFatherName, member.first_name) &&
    lastnameMatch
  ) {
    signals.push("father_name_match");
  }

  // R4 — row's mother_name == this member's first_name
  // Suggests: row is a child of this member (από μητέρα side).
  // No lastname requirement — μητέρα συχνά έχει διαφορετικό surname.
  if (rowMotherName && namesEqual(rowMotherName, member.first_name)) {
    signals.push("mother_name_match");
  }

  // R5 (COMPOUND) — row's first_name == member's mother_name OR maiden_name
  // AND (lastname match OR address match) για suppress false positives από
  // common Greek first names ("ΜΑΡΙΑ", "ΕΛΕΝΗ").
  // Suggests: row IS the mother of existing member.
  if (rowFirstName) {
    const matchesMemberMother = namesEqual(rowFirstName, member.mother_name);
    const matchesMemberMaiden = namesEqual(rowFirstName, member.maiden_name);
    if (
      (matchesMemberMother || matchesMemberMaiden) &&
      (lastnameMatch || addressMatch)
    ) {
      signals.push("firstname_matches_member_mother");
    }
  }

  if (signals.length === 0) return null;

  const memberName =
    [member.last_name, member.first_name].filter(Boolean).join(" ").trim() ||
    "(άγνωστο)";

  return {
    memberId: member.id,
    memberName,
    score: signals.length * SCORE_PER_SIGNAL,
    signals,
  };
}

// ──────────────────────────────────────────────────────────────────
// detectFamilyCandidates — public entry point
// ──────────────────────────────────────────────────────────────────

/**
 * Επιστρέφει top-N family hints για μία row, sorted κατά score desc.
 * Empty array αν κανένα rule δεν fire-ει για κανένα member.
 *
 * Self-match exclusion intentionally absent: detection runs parallel
 * to rankCandidates χωρίς coordination. Downstream filter (skipped-only
 * CSV annotation) prevents admin-confirmed candidates από receiving
 * family hints αυτόματα.
 */
export function detectFamilyCandidates(
  row: NormalizedExcelRow,
  members: MatchableMember[],
): FamilyHint[] {
  const hints: FamilyHint[] = [];
  for (const member of members) {
    const hint = detectFamilyHintForMember(row, member);
    // Threshold check: redundant in current impl (any signal → score >= 50)
    // but preserved για future rules με partial scores ή weighted signals.
    if (hint && hint.score >= FAMILY_HINT_THRESHOLD) {
      hints.push(hint);
    }
  }
  hints.sort((a, b) => b.score - a.score);
  return hints.slice(0, TOP_N_FAMILY_HINTS);
}
