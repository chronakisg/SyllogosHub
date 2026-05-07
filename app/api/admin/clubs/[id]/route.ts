import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/requireSuperAdmin";
import { getAdminClient } from "@/lib/supabase/admin";
import type { ClubPlan, ClubUpdate } from "@/lib/supabase/types";

type Params = { params: Promise<{ id: string }> };

// ─────────── Validation rules ───────────
const VALID_PLANS: readonly ClubPlan[] = ["basic", "pro", "premium"] as const;
const PG_NO_ROWS = "PGRST116";

type PatchBody = {
  plan?: unknown;
  is_active?: unknown;
};

type DeleteBody = {
  confirmSlug?: unknown;
};

function isString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

// ─────────── PATCH: Update plan / is_active ───────────
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    await requireSuperAdmin();
    const { id } = await params;

    const raw = (await req.json().catch(() => null)) as PatchBody | null;
    if (!raw) {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const { plan, is_active } = raw;
    const hasPlan = plan !== undefined;
    const hasIsActive = is_active !== undefined;

    if (!hasPlan && !hasIsActive) {
      return NextResponse.json(
        { error: "Καμία αλλαγή — δώσε τουλάχιστον plan ή is_active" },
        { status: 400 },
      );
    }

    const update: ClubUpdate = {};

    if (hasPlan) {
      if (!isString(plan) || !VALID_PLANS.includes(plan as ClubPlan)) {
        return NextResponse.json(
          {
            error: `Invalid plan — αποδεκτές τιμές: ${VALID_PLANS.join(", ")}`,
          },
          { status: 400 },
        );
      }
      update.plan = plan as ClubPlan;
    }

    if (hasIsActive) {
      if (typeof is_active !== "boolean") {
        return NextResponse.json(
          { error: "is_active πρέπει να είναι boolean" },
          { status: 400 },
        );
      }
      update.is_active = is_active;
    }

    const admin = getAdminClient();
    const { data: club, error } = await admin
      .from("clubs")
      .update(update)
      .eq("id", id)
      .select("id, name, slug, plan, is_active, created_at")
      .single();

    if (error) {
      if (error.code === PG_NO_ROWS) {
        return NextResponse.json(
          { error: "Σύλλογος δεν βρέθηκε" },
          { status: 404 },
        );
      }
      throw error;
    }

    return NextResponse.json({ club });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[PATCH /api/admin/clubs/[id]]", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ─────────── DELETE: Hard delete με type-to-confirm ───────────
// Βασίζεται σε migration 0015 (FKs σε CASCADE) — η DELETE FROM
// clubs καθαρίζει αυτόματα members, events, payments, settings,
// reservation_attendees, user_roles και ό,τι κάνει transitive
// CASCADE από αυτά (π.χ. member_role_assignments μέσω members).
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    await requireSuperAdmin();
    const { id } = await params;

    const raw = (await req.json().catch(() => null)) as DeleteBody | null;
    if (!raw) {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }
    if (!isString(raw.confirmSlug)) {
      return NextResponse.json(
        { error: "confirmSlug απαιτείται" },
        { status: 400 },
      );
    }

    const admin = getAdminClient();

    // 1. Lookup slug για να επικυρώσουμε confirmSlug
    const { data: club, error: lookupError } = await admin
      .from("clubs")
      .select("slug")
      .eq("id", id)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!club) {
      return NextResponse.json(
        { error: "Σύλλογος δεν βρέθηκε" },
        { status: 404 },
      );
    }

    // 2. Server-side type-to-confirm check (defense in depth —
    //    το client UX δεν είναι παρακάμψιμο σε direct API calls)
    if (raw.confirmSlug !== club.slug) {
      return NextResponse.json(
        { error: "Λάθος επιβεβαίωση slug" },
        { status: 400 },
      );
    }

    // 3. Hard delete (CASCADE μέσω migration 0015)
    const { error: deleteError } = await admin
      .from("clubs")
      .delete()
      .eq("id", id);
    if (deleteError) throw deleteError;

    return NextResponse.json({ deleted: true, slug: club.slug });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[DELETE /api/admin/clubs/[id]]", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
