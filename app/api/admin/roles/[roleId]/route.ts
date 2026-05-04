import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { getServerClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ roleId: string }> };

// ─────────── PATCH: update name / description ───────────
// System roles: description editable, name immutable.
// Custom roles: both editable.
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireAdmin();
    const { roleId } = await params;
    const body = await req.json();
    const { name, description } = body as {
      name?: string;
      description?: string;
    };

    const supabase = await getServerClient();

    const { data: role, error: loadError } = await supabase
      .from("member_roles")
      .select("id, name, description, is_system")
      .eq("id", roleId)
      .eq("club_id", ctx.clubId)
      .maybeSingle();

    if (loadError || !role) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }

    const updates: { name?: string; description?: string | null } = {};

    if (name !== undefined) {
      if (role.is_system && name.trim() !== role.name) {
        return NextResponse.json(
          { error: "Δεν μπορείς να αλλάξεις το όνομα ενός system role" },
          { status: 403 }
        );
      }
      if (name.trim().length < 2) {
        return NextResponse.json(
          { error: "Το όνομα πρέπει να έχει τουλάχιστον 2 χαρακτήρες" },
          { status: 400 }
        );
      }
      updates.name = name.trim();
    }

    if (description !== undefined) {
      updates.description = description.trim() || null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "Δεν δόθηκαν αλλαγές" },
        { status: 400 }
      );
    }

    const { data: updated, error: updateError } = await supabase
      .from("member_roles")
      .update(updates)
      .eq("id", roleId)
      .select()
      .single();

    if (updateError) {
      if (updateError.code === "23505") {
        return NextResponse.json(
          { error: "Υπάρχει ήδη ρόλος με αυτό το όνομα" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ role: updated });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[PATCH /api/admin/roles/[roleId]]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─────────── DELETE: delete custom role ───────────
// System roles: blocked.
// Custom roles with active assignments: blocked.
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireAdmin();
    const { roleId } = await params;

    const supabase = await getServerClient();

    const { data: role } = await supabase
      .from("member_roles")
      .select("id, name, is_system")
      .eq("id", roleId)
      .eq("club_id", ctx.clubId)
      .maybeSingle();

    if (!role) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }

    if (role.is_system) {
      return NextResponse.json(
        { error: "Οι system ρόλοι δεν διαγράφονται" },
        { status: 403 }
      );
    }

    const { count: assignmentCount } = await supabase
      .from("member_role_assignments")
      .select("id", { count: "exact", head: true })
      .eq("role_id", roleId);

    if ((assignmentCount ?? 0) > 0) {
      return NextResponse.json(
        {
          error: `Ο ρόλος έχει ${assignmentCount} ανατεθειμένα μέλη. Αφαίρεσέ τα πρώτα.`,
          memberCount: assignmentCount,
        },
        { status: 409 }
      );
    }

    const { error: deleteError } = await supabase
      .from("member_roles")
      .delete()
      .eq("id", roleId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, deleted: role.name });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[DELETE /api/admin/roles/[roleId]]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
