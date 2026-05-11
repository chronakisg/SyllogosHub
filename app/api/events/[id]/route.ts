import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/requirePermission";
import { errorResponse } from "@/lib/auth/errorResponse";
import { computeChanges, logChange } from "@/lib/audit/log";
import type { EventUpdate } from "@/lib/supabase/types";

// ────────────────────────────────────────────────────────────────────
// Field whitelist
// ────────────────────────────────────────────────────────────────────
// Phase A.1 scope: primary event metadata fields.
// Excluded από whitelist:
//   - id, club_id, created_at: immutable
//   - venue_map_config (jsonb): complex diff, low audit signal value
//     (future: semantic events, όχι raw jsonb diff)

const ALLOWED_FIELDS = [
  "event_name",
  "event_date",
  "location",
  "venue_max_capacity",
] as const;

type AllowedField = (typeof ALLOWED_FIELDS)[number];

// ────────────────────────────────────────────────────────────────────
// PATCH — partial event update με audit hook
// ────────────────────────────────────────────────────────────────────
// Auth: requires 'events' permission (system admin + president
// short-circuit included via requirePermission helper).
//
// Multi-tenant: event must belong στο authenticated user's club.
// Cross-club access denied as 404 (avoid leaking existence).
//
// Audit: writes ξεχωριστό audit_log entry για κάθε successful update
// με field-level diff. Empty-diff submissions (no actual changes)
// skip audit (logChange has internal guard).

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: eventId } = await context.params;

  // 1. Auth + permission gate (throws Response on failure)
  let ctx;
  try {
    ctx = await requirePermission("events");
  } catch (err) {
    if (err instanceof Response) return err;
    return errorResponse("Auth check failed", 500);
  }

  // 2. Parse JSON body
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  if (!body || typeof body !== "object") {
    return errorResponse("Body must be a JSON object", 400);
  }

  // 3. Per-field type validation
  // ─────────────────────────────
  // Whitelist enforcement (keys) + runtime type validation (values).
  // Invalid values rejected at API boundary για clear error messages
  // αντί cryptic DB errors. Null permitted όπου το schema επιτρέπει.

  const updates: EventUpdate = {};
  const invalidFields: string[] = [];

  if ("event_name" in body) {
    if (typeof body.event_name === "string" && body.event_name.trim().length > 0) {
      updates.event_name = body.event_name.trim();
    } else {
      invalidFields.push("event_name (πρέπει να είναι μη-κενό string)");
    }
  }

  if ("event_date" in body) {
    if (typeof body.event_date === "string" && body.event_date.length > 0) {
      // ISO timestamp validation — Supabase θα reject malformed dates,
      // αλλά basic shape check εδώ για early failure
      const parsed = Date.parse(body.event_date);
      if (Number.isFinite(parsed)) {
        updates.event_date = body.event_date;
      } else {
        invalidFields.push("event_date (μη έγκυρη ISO ημερομηνία)");
      }
    } else {
      invalidFields.push("event_date (πρέπει να είναι ISO date string)");
    }
  }

  if ("location" in body) {
    // location nullable στο schema
    if (body.location === null) {
      updates.location = null;
    } else if (typeof body.location === "string") {
      updates.location = body.location.trim();
    } else {
      invalidFields.push("location (πρέπει να είναι string ή null)");
    }
  }

  if ("venue_max_capacity" in body) {
    // venue_max_capacity nullable στο schema
    if (body.venue_max_capacity === null) {
      updates.venue_max_capacity = null;
    } else if (
      typeof body.venue_max_capacity === "number" &&
      Number.isInteger(body.venue_max_capacity) &&
      body.venue_max_capacity >= 0
    ) {
      updates.venue_max_capacity = body.venue_max_capacity;
    } else {
      invalidFields.push(
        "venue_max_capacity (πρέπει να είναι μη-αρνητικός ακέραιος ή null)"
      );
    }
  }

  if (invalidFields.length > 0) {
    return errorResponse(
      "Μη έγκυρα fields: " + invalidFields.join(", "),
      400
    );
  }

  if (Object.keys(updates).length === 0) {
    return errorResponse(
      "Κανένα έγκυρο field στο body. Allowed: " +
        ALLOWED_FIELDS.join(", "),
      400
    );
  }

  const supabase = await getServerClient();

  // 4. Before-snapshot με tenant scoping
  //    Διπλό filter (id + club_id) — αν event ανήκει σε άλλο club,
  //    επιστρέφει null (404 — αποφεύγει existence leakage)
  const { data: before, error: fetchError } = await supabase
    .from("events")
    .select(
      "id, club_id, event_name, event_date, location, venue_max_capacity"
    )
    .eq("id", eventId)
    .eq("club_id", ctx.clubId)
    .maybeSingle();

  if (fetchError) {
    return errorResponse(
      `Event lookup failed: ${fetchError.message}`,
      500
    );
  }
  if (!before) {
    return errorResponse("Event not found", 404);
  }

  // 5. UPDATE με tenant guard (defense-in-depth — same filter στο update)
  const { data: after, error: updateError } = await supabase
    .from("events")
    .update(updates)
    .eq("id", eventId)
    .eq("club_id", ctx.clubId)
    .select(
      "id, club_id, event_name, event_date, location, venue_max_capacity"
    )
    .single();

  if (updateError || !after) {
    return errorResponse(
      `Update failed: ${updateError?.message ?? "unknown error"}`,
      500
    );
  }

  // 6. Audit hook (fail-soft — errors logged αλλά δεν fail-άρουν response)
  const changes = computeChanges(before, after, [...ALLOWED_FIELDS]);
  if (Object.keys(changes).length > 0) {
    await logChange({
      clubId: ctx.clubId,
      tableName: "events",
      recordId: eventId,
      action: "update",
      actorLabel: "admin",
      actorUserId: ctx.userId,
      actorMemberId: ctx.memberId,
      changes,
      notes: null,
    });
  }

  // 7. Return updated event
  return NextResponse.json({ event: after });
}
