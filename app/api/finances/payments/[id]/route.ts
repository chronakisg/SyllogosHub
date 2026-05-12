import { NextResponse, type NextRequest } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/auth/requirePermission";
import { errorResponse } from "@/lib/auth/errorResponse";
import { computeChanges, logChange } from "@/lib/audit/log";
import type { Payment, PaymentUpdate } from "@/lib/supabase/types";

/**
 * PATCH /api/finances/payments/[id]
 *
 * Generic field editing για payments. Field whitelist:
 * - amount
 * - payment_date
 * - period
 * - original_amount
 *
 * ΟΧΙ editable μέσω PATCH:
 * - approval_status (state transitions → RPC endpoints /approve, /reject)
 * - approved_by, approved_at (server-managed)
 * - type (immutable σε edit — future RPC αν χρειαστεί)
 * - member_id, club_id, batch_id (identifiers)
 *
 * Phase B.1a. Connects με PAYMENTS_AUDIT_PLAN.md (PR #61).
 * Mirror του events PATCH pattern (PR #60).
 */

const ALLOWED_FIELDS = [
  "amount",
  "payment_date",
  "period",
  "original_amount",
] as const;

type AllowedField = (typeof ALLOWED_FIELDS)[number];

const MAX_AMOUNT = 9_999_999; // €9.9M safety cap — N-club ready
const MAX_PERIOD_LENGTH = 50;

type InvalidField = { field: string; message: string };

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 1. Auth + permission gate
  let ctx;
  try {
    ctx = await requirePermission("finances");
  } catch (response) {
    if (response instanceof Response) return response;
    throw response;
  }

  // 2. Async params (Next.js 16 pattern)
  const { id: paymentId } = await params;
  if (!paymentId) {
    return errorResponse("Λείπει το ID πληρωμής", 400);
  }

  // 3. Parse + validate body
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Μη έγκυρο JSON στο body", 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return errorResponse("Body πρέπει να είναι αντικείμενο", 400);
  }

  // 4. Whitelist filter + per-field validation
  const updates: Record<string, unknown> = {};
  const invalidFields: InvalidField[] = [];

  for (const [field, value] of Object.entries(body)) {
    if (!ALLOWED_FIELDS.includes(field as AllowedField)) {
      invalidFields.push({
        field,
        message: `Πεδίο '${field}' δεν επιτρέπεται. Έγκυρα: ${ALLOWED_FIELDS.join(", ")}`,
      });
      continue;
    }

    // Per-field validation
    if (field === "amount") {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0 || n > MAX_AMOUNT) {
        invalidFields.push({
          field,
          message: `Το ποσό πρέπει να είναι θετικός αριθμός (έως €${MAX_AMOUNT.toLocaleString("el-GR")})`,
        });
        continue;
      }
      updates[field] = n;
    } else if (field === "original_amount") {
      if (value === null) {
        updates[field] = null;
      } else {
        const n = Number(value);
        if (!Number.isFinite(n) || n < 0 || n > MAX_AMOUNT) {
          invalidFields.push({
            field,
            message: `Το αρχικό ποσό πρέπει να είναι θετικός αριθμός ή null (έως €${MAX_AMOUNT.toLocaleString("el-GR")})`,
          });
          continue;
        }
        updates[field] = n;
      }
    } else if (field === "payment_date") {
      if (typeof value !== "string" || !value.trim()) {
        invalidFields.push({
          field,
          message: "Η ημερομηνία πληρωμής πρέπει να είναι μη κενό string",
        });
        continue;
      }
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) {
        invalidFields.push({
          field,
          message: "Μη έγκυρη ημερομηνία πληρωμής",
        });
        continue;
      }
      updates[field] = value;
    } else if (field === "period") {
      if (value === null) {
        updates[field] = null;
      } else if (typeof value !== "string") {
        invalidFields.push({
          field,
          message: "Η περίοδος πρέπει να είναι string ή null",
        });
        continue;
      } else {
        const trimmed = value.trim();
        if (trimmed.length > MAX_PERIOD_LENGTH) {
          invalidFields.push({
            field,
            message: `Η περίοδος δεν πρέπει να ξεπερνά τους ${MAX_PERIOD_LENGTH} χαρακτήρες`,
          });
          continue;
        }
        updates[field] = trimmed || null;
      }
    }
  }

  // 5. Empty update guard (όχι 'reject με 400' — όλα τα fields filtered)
  if (Object.keys(updates).length === 0) {
    if (invalidFields.length > 0) {
      return errorResponse(
        `Κανένα έγκυρο field για update. Σφάλματα: ${invalidFields
          .map((f) => `${f.field}: ${f.message}`)
          .join("; ")}`,
        400
      );
    }
    return errorResponse("Δεν δόθηκαν fields για update", 400);
  }

  // Αν υπάρχουν invalid fields ΠΑΡΑΛΛΗΛΑ με valid → reject (atomic semantics)
  if (invalidFields.length > 0) {
    return errorResponse(
      `Validation errors: ${invalidFields
        .map((f) => `${f.field}: ${f.message}`)
        .join("; ")}`,
      400
    );
  }

  // 6. Before-snapshot με tenant scoping (defense-in-depth)
  const admin = getAdminClient();
  const { data: before, error: beforeError } = await admin
    .from("payments")
    .select("*")
    .eq("id", paymentId)
    .eq("club_id", ctx.clubId)
    .maybeSingle();

  if (beforeError) {
    console.error("[payments PATCH] Before-snapshot error:", beforeError);
    return errorResponse("Σφάλμα στην ανάκτηση πληρωμής", 500);
  }
  if (!before) {
    return errorResponse("Η πληρωμή δεν βρέθηκε", 404);
  }

  // 7. Update με tenant scoping (defense-in-depth)
  const { data: after, error: updateError } = await admin
    .from("payments")
    .update(updates as PaymentUpdate)
    .eq("id", paymentId)
    .eq("club_id", ctx.clubId)
    .select("*")
    .single();

  if (updateError) {
    console.error("[payments PATCH] Update error:", updateError);
    return errorResponse("Σφάλμα στην ενημέρωση πληρωμής", 500);
  }

  // 8. Audit hook (fail-soft, empty-diff skip)
  const changes = computeChanges<Payment>(
    before as Payment,
    after as Payment,
    [...ALLOWED_FIELDS]
  );

  await logChange({
    clubId: ctx.clubId,
    tableName: "payments",
    recordId: paymentId,
    action: "update",
    actorLabel: "admin",
    actorUserId: ctx.userId,
    actorMemberId: ctx.memberId,
    changes,
  });

  return NextResponse.json({ payment: after });
}
