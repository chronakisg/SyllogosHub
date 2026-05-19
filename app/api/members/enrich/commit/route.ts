// app/api/members/enrich/commit/route.ts
//
// POST /api/members/enrich/commit
//
// Εκτελεί τις per-row decisions του enrichment wizard: UPDATE σε
// matched members + audit entries + skipped accounting.
//
// Auth: 'members' permission (flat module check — plan §8.1).
// Tenant scope: ctx.clubId via requirePermission → resolveAuthMember.
//
// Client: admin (PR #92 convention — admin writes πέραν user scope,
// future-RLS-safe). Auth gate έχει ήδη περάσει app-layer μέσω
// requirePermission. Defensive .eq("club_id", ctx.clubId) σε ΚΑΘΕ
// query παραμένει για strict tenant isolation.
//
// Audit: 1 audit_log entry ανά successful row UPDATE μέσω existing
// logChange() (PR #49). actorLabel='admin', notes='Enriched from
// <filename> row <N>' (plan §7.3). logChange είναι fail-soft —
// audit failure δεν blocks το enrichment.
//
// Error policy: per-row try/catch — μία αποτυχία ΔΕΝ ρίχνει το
// υπόλοιπο batch. Failed entries επιστρέφονται στο response.

import { NextResponse } from "next/server";

import { computeChanges, logChange } from "@/lib/audit/log";
import { errorResponse } from "@/lib/auth/errorResponse";
import { requirePermission } from "@/lib/auth/requirePermission";
import {
  ENRICH_FIELDS,
  type EnrichField,
  type EnrichmentDecision,
  type SkipReason,
} from "@/lib/enrich/types";
import { getAdminClient } from "@/lib/supabase/admin";

// ──────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────

/** Same cap με match endpoint — plan §2.3 file size limit ≈ 10k rows. */
const MAX_DECISIONS = 10000;

/** Filename appears στο audit notes — keep bounded για readability + DB. */
const MAX_FILENAME_LEN = 255;

/** Whitelist των έγκυρων SkipReason values (strict enum validation). */
const VALID_SKIP_REASONS: readonly SkipReason[] = ["no_match", "admin_skipped"];

// ──────────────────────────────────────────────────────────────────
// Response shape
// ──────────────────────────────────────────────────────────────────

type SkippedEntry = {
  rowIndex: number;
  reason: SkipReason;
};

type FailedEntry = {
  rowIndex: number;
  reason: string;
};

type RouteResponse = {
  enriched: number;
  skipped: SkippedEntry[];
  failed: FailedEntry[];
};

// ──────────────────────────────────────────────────────────────────
// POST
// ──────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  // 1. Auth + permission gate (matches match endpoint pattern)
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

  // 3. Validate filename
  if (
    typeof body.filename !== "string" ||
    body.filename.length < 1 ||
    body.filename.length > MAX_FILENAME_LEN
  ) {
    return NextResponse.json(
      {
        error: `filename must be a string of length 1..${MAX_FILENAME_LEN}`,
      },
      { status: 400 },
    );
  }
  const filename = body.filename;

  // 4. Validate decisions array shape + length cap (0..MAX_DECISIONS,
  //    empty array OK — returns zeroed counters)
  const decisionsRaw = body.decisions;
  if (!Array.isArray(decisionsRaw)) {
    return NextResponse.json(
      { error: "decisions must be an array" },
      { status: 400 },
    );
  }
  if (decisionsRaw.length > MAX_DECISIONS) {
    return NextResponse.json(
      { error: `Too many decisions (max ${MAX_DECISIONS})` },
      { status: 400 },
    );
  }

  // Per-decision structural validation. Builds typed array για downstream
  // iteration. Strict per-key checks αποφεύγουν cryptic runtime errors.
  const decisions: EnrichmentDecision[] = [];
  for (let i = 0; i < decisionsRaw.length; i++) {
    const d = decisionsRaw[i];
    if (!d || typeof d !== "object" || Array.isArray(d)) {
      return NextResponse.json(
        { error: `decisions[${i}] must be an object` },
        { status: 400 },
      );
    }
    const rec = d as Record<string, unknown>;

    if (typeof rec.rowIndex !== "number" || !Number.isFinite(rec.rowIndex)) {
      return NextResponse.json(
        { error: `decisions[${i}].rowIndex must be a finite number` },
        { status: 400 },
      );
    }

    if (rec.kind === "apply") {
      if (typeof rec.memberId !== "string" || rec.memberId.length === 0) {
        return NextResponse.json(
          { error: `decisions[${i}].memberId must be a non-empty string` },
          { status: 400 },
        );
      }
      if (
        !rec.fieldUpdates ||
        typeof rec.fieldUpdates !== "object" ||
        Array.isArray(rec.fieldUpdates)
      ) {
        return NextResponse.json(
          { error: `decisions[${i}].fieldUpdates must be an object` },
          { status: 400 },
        );
      }
      decisions.push({
        kind: "apply",
        rowIndex: rec.rowIndex,
        memberId: rec.memberId,
        fieldUpdates: rec.fieldUpdates as Partial<
          Record<EnrichField, string | null>
        >,
      });
    } else if (rec.kind === "skip") {
      if (
        typeof rec.reason !== "string" ||
        !VALID_SKIP_REASONS.includes(rec.reason as SkipReason)
      ) {
        return NextResponse.json(
          {
            error: `decisions[${i}].reason must be one of: ${VALID_SKIP_REASONS.join(
              ", ",
            )}`,
          },
          { status: 400 },
        );
      }
      decisions.push({
        kind: "skip",
        rowIndex: rec.rowIndex,
        reason: rec.reason as SkipReason,
      });
    } else {
      return NextResponse.json(
        { error: `decisions[${i}].kind must be 'apply' or 'skip'` },
        { status: 400 },
      );
    }
  }

  // 5. Main loop — sequential, best-effort per-row
  const admin = getAdminClient();
  const skipped: SkippedEntry[] = [];
  const failed: FailedEntry[] = [];
  let enriched = 0;

  // Before-snapshot column list για audit diff (10 ENRICH_FIELDS + id για
  // tenant safety post-fetch). Static string αποφεύγει template re-evaluation.
  const BEFORE_SELECT = `id, ${ENRICH_FIELDS.join(", ")}`;

  for (const decision of decisions) {
    if (decision.kind === "skip") {
      skipped.push({ rowIndex: decision.rowIndex, reason: decision.reason });
      continue;
    }

    // decision.kind === 'apply'
    try {
      // 5.1 Before snapshot — tenant-scoped lookup. Cross-club access → !found.
      const { data: before, error: beforeErr } = await admin
        .from("members")
        .select(BEFORE_SELECT)
        .eq("id", decision.memberId)
        .eq("club_id", ctx.clubId)
        .maybeSingle();

      if (beforeErr) {
        failed.push({
          rowIndex: decision.rowIndex,
          reason: `Lookup failed: ${beforeErr.message}`,
        });
        continue;
      }
      if (!before) {
        failed.push({
          rowIndex: decision.rowIndex,
          reason: "Member not found",
        });
        continue;
      }

      // 5.2 Build updates: ENRICH_FIELDS whitelist + email fill-only rule
      //     (plan §6.2 — email overwrite blocked when existing value present)
      const updates: Partial<Record<EnrichField, string | null>> = {};
      const beforeRow = before as unknown as Record<string, unknown>;

      for (const field of ENRICH_FIELDS) {
        if (!(field in decision.fieldUpdates)) continue;
        const newValue = decision.fieldUpdates[field];
        if (newValue === undefined) continue; // defensive — treat as absent

        // Email fill-only — silently drop overwrite of populated email
        if (field === "email") {
          const currentEmail = beforeRow.email;
          if (typeof currentEmail === "string" && currentEmail.length > 0) {
            continue;
          }
        }

        updates[field] = newValue;
      }

      // Silent no-op: all fields unticked client-side OR all dropped by
      // email rule. No counter increment, no audit entry.
      if (Object.keys(updates).length === 0) {
        continue;
      }

      // 5.3 UPDATE — tenant-scoped. No .select() return (in-memory after
      //     synthesis matches /api/me/[token]/update reference pattern).
      const { error: updateErr } = await admin
        .from("members")
        .update(updates)
        .eq("id", decision.memberId)
        .eq("club_id", ctx.clubId);

      if (updateErr) {
        failed.push({
          rowIndex: decision.rowIndex,
          reason: updateErr.message,
        });
        continue;
      }

      // 5.4 Audit (fail-soft) — in-memory after synthesis + computeChanges
      //     filtered to ENRICH_FIELDS only.
      const after = { ...beforeRow, ...updates };
      const changes = computeChanges(beforeRow, after, [...ENRICH_FIELDS]);

      await logChange({
        clubId: ctx.clubId,
        tableName: "members",
        recordId: decision.memberId,
        action: "update",
        actorLabel: "admin",
        actorUserId: ctx.userId,
        actorMemberId: ctx.memberId,
        changes,
        notes: `Enriched from ${filename} row ${decision.rowIndex + 1}`,
      });

      enriched++;
    } catch (err) {
      failed.push({
        rowIndex: decision.rowIndex,
        reason: "Unexpected error",
      });
      console.error(
        `[POST /api/members/enrich/commit] row failed (rowIndex: ${decision.rowIndex}, memberId: ${decision.memberId}):`,
        err,
      );
    }
  }

  const response: RouteResponse = {
    enriched,
    skipped,
    failed,
  };
  return NextResponse.json(response);
}
