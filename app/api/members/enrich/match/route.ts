// app/api/members/enrich/match/route.ts
//
// POST /api/members/enrich/match
//
// Παίρνει mappedRows (Excel rows ήδη normalized client-side μέσω
// lib/enrich/normalize.ts → normalizeRow) και επιστρέφει per-row
// ranked candidates από τα members του club.
//
// Read-only — zero writes, zero audit. Ο actual UPDATE θα γίνει στο
// Commit 3 μέσω /api/members/enrich/commit.
//
// Auth: 'members' permission (flat module check — plan §8.1).
// Tenant scope: ctx.clubId resolved μέσω requirePermission →
// resolveAuthMember (email-based member lookup).
//
// Client: admin (PR #92 convention για "admin reads πέραν user scope").
// Auth gate έχει ήδη περάσει app-layer μέσω requirePermission, οπότε
// safety preserved + future-RLS-proof. Defensive .eq("club_id") διατηρεί
// strict tenant filtering ανεξάρτητα από RLS state.

import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/auth/errorResponse";
import { requirePermission } from "@/lib/auth/requirePermission";
import { getAdminClient } from "@/lib/supabase/admin";

import {
  detectFamilyCandidates,
  type FamilyHint,
} from "@/lib/enrich/family";
import {
  MATCH_THRESHOLD_SECONDARY,
  MATCHABLE_SELECT,
  rankCandidates,
  type MatchableMember,
} from "@/lib/enrich/match";
import type {
  MatchCandidate,
  NormalizedExcelRow,
} from "@/lib/enrich/types";

// ──────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────

/**
 * Max candidates ανά row. Plan §4.2 review UI εμφανίζει top matches —
 * >5 προσθέτει noise χωρίς decision value.
 */
const CANDIDATES_PER_ROW = 5;

/**
 * Hard cap στο size του incoming batch. Plan §2.3 file cap ≈ 10k rows
 * (5MB Excel). Πάνω από αυτό → 400 (likely malicious ή buggy client).
 */
const MAX_MAPPED_ROWS = 10000;

// ──────────────────────────────────────────────────────────────────
// Response shape
// ──────────────────────────────────────────────────────────────────

type PerRowResponse = {
  rowIndex: number;
  candidates: MatchCandidate[];
  familyHints: FamilyHint[];
};

type RouteResponse = {
  perRow: PerRowResponse[];
  /**
   * Full members list επιστρέφεται για client-side manual member
   * search στο ReviewCard (plan §4.2 fallback). 13-column lean shape
   * — payload ~30KB για 244 members.
   */
  allMembers: MatchableMember[];
};

// ──────────────────────────────────────────────────────────────────
// POST
// ──────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  // 1. Auth + permission gate (matches app/api/events/[id]/route.ts:48
  //    pattern — throws Response on auth/perm failure)
  let ctx;
  try {
    ctx = await requirePermission("members");
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse("Auth check failed", 500);
  }

  // 2. Parse JSON body
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { error: "Body must be a JSON object" },
      { status: 400 },
    );
  }

  // 3. Validate filename (used για audit notes σε Commit 3 + error context εδώ)
  if (typeof body.filename !== "string" || body.filename.trim() === "") {
    return NextResponse.json(
      { error: "filename is required and must be a non-empty string" },
      { status: 400 },
    );
  }
  const filename = body.filename;

  // 4. Validate mappedRows shape + length cap
  const mappedRowsRaw = body.mappedRows;
  if (!Array.isArray(mappedRowsRaw)) {
    return NextResponse.json(
      { error: "mappedRows must be an array" },
      { status: 400 },
    );
  }
  if (mappedRowsRaw.length > MAX_MAPPED_ROWS) {
    return NextResponse.json(
      { error: `Too many rows (max ${MAX_MAPPED_ROWS})` },
      { status: 400 },
    );
  }

  // Structural validation per row — minimal shape για downstream safety.
  // rankCandidates ανέχεται missing optional values (treats undefined→null
  // → no signal contribution), οπότε εδώ ελέγχουμε μόνο τα 3 required keys.
  const mappedRows: NormalizedExcelRow[] = [];
  for (let i = 0; i < mappedRowsRaw.length; i++) {
    const r = mappedRowsRaw[i];
    if (!r || typeof r !== "object" || Array.isArray(r)) {
      return NextResponse.json(
        { error: `mappedRows[${i}] must be an object` },
        { status: 400 },
      );
    }
    const rec = r as Record<string, unknown>;
    if (typeof rec.rowIndex !== "number" || !Number.isFinite(rec.rowIndex)) {
      return NextResponse.json(
        { error: `mappedRows[${i}].rowIndex must be a finite number` },
        { status: 400 },
      );
    }
    if (
      !rec.values ||
      typeof rec.values !== "object" ||
      Array.isArray(rec.values)
    ) {
      return NextResponse.json(
        { error: `mappedRows[${i}].values must be an object` },
        { status: 400 },
      );
    }
    if (!Array.isArray(rec.phones)) {
      return NextResponse.json(
        { error: `mappedRows[${i}].phones must be an array` },
        { status: 400 },
      );
    }
    mappedRows.push(r as unknown as NormalizedExcelRow);
  }

  // 5. Fetch all members του club σε μία query (lean .select() με μόνο
  //    τα 13 MatchableMember columns — αποφεύγει over-fetch)
  const admin = getAdminClient();
  const { data: members, error: membersError } = await admin
    .from("members")
    .select(MATCHABLE_SELECT)
    .eq("club_id", ctx.clubId);

  if (membersError) {
    console.error(
      `[POST /api/members/enrich/match] members fetch failed (file: ${filename}, rows: ${mappedRows.length}):`,
      membersError,
    );
    return errorResponse(
      `Σφάλμα ανάκτησης μελών: ${membersError.message}`,
      500,
    );
  }

  // Supabase types δεν infer-άρουν shape από non-literal select string —
  // double-cast (unknown → typed) είναι ο canonical workaround.
  const matchable = (members ?? []) as unknown as MatchableMember[];

  // 6. Per-row ranking + filtering
  //    rankCandidates επιστρέφει sorted desc· εδώ απλώς φιλτράρουμε
  //    threshold + cap. Score < MATCH_THRESHOLD_SECONDARY (25) δεν
  //    surfaceάρεται στο UI default list (plan §4.2)· manual search
  //    fallback θα το βρει αν χρειαστεί (Commit 4 UI).
  const perRow: PerRowResponse[] = mappedRows.map((row) => {
    const ranked = rankCandidates(row, matchable);
    const candidates = ranked
      .filter((c) => c.score >= MATCH_THRESHOLD_SECONDARY)
      .slice(0, CANDIDATES_PER_ROW);
    // Family-of detection runs parallel για CSV annotation (see family.ts).
    // Self-match exclusion handled downstream: only skipped rows get the
    // _likely_family_of column populated.
    const familyHints = detectFamilyCandidates(row, matchable);
    return { rowIndex: row.rowIndex, candidates, familyHints };
  });

  const response: RouteResponse = { perRow, allMembers: matchable };
  return NextResponse.json(response);
}
