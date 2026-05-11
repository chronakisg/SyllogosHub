// lib/audit/log.ts
//
// Generic audit logging για member self-updates και (μελλοντικά)
// admin actions, events, finances, sponsors.
//
// 2 exports:
// - computeChanges: pure utility για diff calculation
// - logChange: async writer στο audit_log table
//
// Fail-soft: errors logged, never thrown. Audit failure δεν
// μπλοκάρει user actions.

import { getAdminClient } from "@/lib/supabase/admin";
import type {
  AuditAction,
  AuditActorLabel,
  AuditLogChanges,
} from "@/lib/supabase/types";

// ──────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────

export type LogChangeEntry = {
  clubId: string;
  tableName: string;
  recordId: string;
  action: AuditAction;
  actorLabel: AuditActorLabel;
  actorUserId?: string | null;
  actorMemberId?: string | null;
  changes: AuditLogChanges;
  notes?: string | null;
};

// ──────────────────────────────────────────────────────────────────
// computeChanges — pure utility
// ──────────────────────────────────────────────────────────────────

/**
 * Υπολογίζει το diff μεταξύ before και after values για
 * συγκεκριμένα fields. Επιστρέφει empty object αν τίποτα δεν
 * άλλαξε.
 *
 * Normalization: undefined → null για consistency μεταξύ
 * "field missing" και "field explicitly null".
 *
 * Equality check: strict (===). Adequate για flat scalars
 * (string, number, boolean, null). Future: deep equality για
 * jsonb/array fields.
 *
 * @example
 *   computeChanges(
 *     { phone: "6944", address: "Α", id: "..." },
 *     { phone: "6911", address: "Α", id: "..." },
 *     ["phone", "address"]
 *   )
 *   // => { phone: { from: "6944", to: "6911" } }
 */
export function computeChanges<T extends Record<string, unknown>>(
  before: T,
  after: T,
  fields: (keyof T)[],
): AuditLogChanges {
  const diff: AuditLogChanges = {};
  for (const field of fields) {
    const fromVal = before[field] ?? null;
    const toVal = after[field] ?? null;
    if (fromVal !== toVal) {
      diff[field as string] = { from: fromVal, to: toVal };
    }
  }
  return diff;
}

// ──────────────────────────────────────────────────────────────────
// logChange — async writer
// ──────────────────────────────────────────────────────────────────

/**
 * Καταγράφει change στο audit_log.
 *
 * Empty diff → no-op (αποφεύγει spurious entries).
 * Failure → console.error, never throw (audit failure ποτέ
 * δεν πρέπει να μπλοκάρει user action).
 *
 * Service role client → bypass RLS (audit_log RLS off γενικά,
 * αλλά για future-proofing).
 */
export async function logChange(entry: LogChangeEntry): Promise<void> {
  // Skip empty diffs — no spurious entries (παγκόσμιο, ανεξαρτήτως action)
  if (Object.keys(entry.changes).length === 0) {
    return;
  }

  try {
    const admin = getAdminClient();
    const { error } = await admin.from("audit_log").insert({
      club_id: entry.clubId,
      table_name: entry.tableName,
      record_id: entry.recordId,
      action: entry.action,
      actor_label: entry.actorLabel,
      actor_user_id: entry.actorUserId ?? null,
      actor_member_id: entry.actorMemberId ?? null,
      changes: entry.changes,
      notes: entry.notes ?? null,
    });

    if (error) {
      console.error("[audit_log] insert failed:", error);
    }
  } catch (err) {
    console.error("[audit_log] unexpected error:", err);
  }
}

// ──────────────────────────────────────────────────────────────────
// logEmailVerified — discriminated email verification event
// ──────────────────────────────────────────────────────────────────

/**
 * Helper για το discriminated 'email_verified' audit event.
 *
 * Wraps logChange με σωστά defaults για το email verification flow:
 * - action: 'email_verified'
 * - changes: { email_verified: { from: false, to: true } }
 * - table_name: 'members'
 *
 * Καλείται όταν εντοπίζεται transition του email_verified column από
 * false/null σε true. Existing field-update audit (action: 'update')
 * συνεχίζει να γράφεται ξεχωριστά για τα whitelisted self-update fields.
 *
 * Fail-soft: τυχόν errors logged αλλά δεν propagate.
 *
 * @param args - Audit entry parameters
 */
export async function logEmailVerified(args: {
  clubId: string;
  memberId: string;
  actorLabel: AuditActorLabel;
  actorUserId?: string | null;
  actorMemberId?: string | null;
  previousValue?: boolean | null;
  notes?: string | null;
}): Promise<void> {
  await logChange({
    clubId: args.clubId,
    tableName: "members",
    recordId: args.memberId,
    action: "email_verified",
    actorLabel: args.actorLabel,
    actorUserId: args.actorUserId ?? null,
    actorMemberId: args.actorMemberId ?? null,
    changes: {
      email_verified: {
        from: args.previousValue ?? false,
        to: true,
      },
    },
    notes: args.notes ?? null,
  });
}
