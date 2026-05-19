import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { getAdminClient } from "@/lib/supabase/admin";

type RouteContext = {
  params: Promise<{ departmentId: string; memberId: string }>;
};

/**
 * PATCH /api/admin/departments/[departmentId]/leaders/[memberId]
 * Body: { role: 'leader' | 'assistant' }
 * Updates τον ρόλο του member σε αυτό το department.
 *
 * Admin/President only.
 */
export async function PATCH(req: Request, { params }: RouteContext) {
  try {
    const ctx = await requireAdmin();
    const { departmentId, memberId } = await params;

    if (!departmentId || !memberId) {
      return NextResponse.json(
        { error: "Λείπει departmentId ή memberId" },
        { status: 400 }
      );
    }

    let body: { role?: string };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return NextResponse.json(
        { error: "Μη έγκυρο JSON body" },
        { status: 400 }
      );
    }

    const { role } = body;

    if (role !== "leader" && role !== "assistant") {
      return NextResponse.json(
        { error: "role πρέπει να είναι 'leader' ή 'assistant'" },
        { status: 400 }
      );
    }

    const supabase = getAdminClient();

    // 1. Verify department belongs to user's club (defensive scoping)
    const deptCheck = await supabase
      .from("departments")
      .select("id")
      .eq("id", departmentId)
      .eq("club_id", ctx.clubId)
      .maybeSingle();

    if (deptCheck.error) {
      return NextResponse.json(
        { error: deptCheck.error.message },
        { status: 500 }
      );
    }
    if (!deptCheck.data) {
      return NextResponse.json(
        { error: "Το τμήμα δεν βρέθηκε" },
        { status: 404 }
      );
    }

    // 2. Update role (composite PK match)
    const updateRes = await supabase
      .from("department_leaders")
      .update({ role: role as "leader" | "assistant" })
      .eq("department_id", departmentId)
      .eq("member_id", memberId)
      .select()
      .single();

    if (updateRes.error) {
      // No rows matched → 404
      if (updateRes.error.code === "PGRST116") {
        return NextResponse.json(
          { error: "Η ανάθεση ομαδάρχη δεν βρέθηκε" },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: updateRes.error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ leader: updateRes.data });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[PATCH department leader] error", err);
    return NextResponse.json(
      { error: "Σφάλμα διακομιστή" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/departments/[departmentId]/leaders/[memberId]
 * Removes leader assignment.
 *
 * Admin/President only.
 */
export async function DELETE(_req: Request, { params }: RouteContext) {
  try {
    const ctx = await requireAdmin();
    const { departmentId, memberId } = await params;

    if (!departmentId || !memberId) {
      return NextResponse.json(
        { error: "Λείπει departmentId ή memberId" },
        { status: 400 }
      );
    }

    const supabase = getAdminClient();

    // 1. Verify department belongs to user's club
    const deptCheck = await supabase
      .from("departments")
      .select("id")
      .eq("id", departmentId)
      .eq("club_id", ctx.clubId)
      .maybeSingle();

    if (deptCheck.error) {
      return NextResponse.json(
        { error: deptCheck.error.message },
        { status: 500 }
      );
    }
    if (!deptCheck.data) {
      return NextResponse.json(
        { error: "Το τμήμα δεν βρέθηκε" },
        { status: 404 }
      );
    }

    // 2. Delete με count check
    const deleteRes = await supabase
      .from("department_leaders")
      .delete({ count: "exact" })
      .eq("department_id", departmentId)
      .eq("member_id", memberId);

    if (deleteRes.error) {
      return NextResponse.json(
        { error: deleteRes.error.message },
        { status: 500 }
      );
    }

    if (deleteRes.count === 0) {
      return NextResponse.json(
        { error: "Η ανάθεση ομαδάρχη δεν βρέθηκε" },
        { status: 404 }
      );
    }

    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[DELETE department leader] error", err);
    return NextResponse.json(
      { error: "Σφάλμα διακομιστή" },
      { status: 500 }
    );
  }
}
