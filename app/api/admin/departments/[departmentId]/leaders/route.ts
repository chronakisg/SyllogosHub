import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { getAdminClient } from "@/lib/supabase/admin";
import type { DepartmentLeaderInsert } from "@/lib/supabase/types";

type RouteContext = {
  params: Promise<{ departmentId: string }>;
};

/**
 * GET /api/admin/departments/[departmentId]/leaders
 * Returns leader assignments για το συγκεκριμένο department, joined
 * με member details (first_name, last_name, email).
 *
 * Admin/President only.
 */
export async function GET(_req: Request, { params }: RouteContext) {
  try {
    const ctx = await requireAdmin();
    const { departmentId } = await params;

    if (!departmentId) {
      return NextResponse.json(
        { error: "Λείπει departmentId" },
        { status: 400 }
      );
    }

    const supabase = getAdminClient();

    // 1. Verify department belongs to user's club (defensive scoping)
    const deptCheck = await supabase
      .from("departments")
      .select("id, club_id")
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

    // 2. Fetch leader assignments με member details
    const leadersRes = await supabase
      .from("department_leaders")
      .select(
        `
        department_id,
        member_id,
        role,
        started_at,
        members!inner (
          id,
          first_name,
          last_name,
          email
        )
        `
      )
      .eq("department_id", departmentId)
      .order("started_at", { ascending: true });

    if (leadersRes.error) {
      return NextResponse.json(
        { error: leadersRes.error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ leaders: leadersRes.data ?? [] });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[GET department leaders] error", err);
    return NextResponse.json(
      { error: "Σφάλμα διακομιστή" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/departments/[departmentId]/leaders
 * Body: { member_id: string, role: 'leader' | 'assistant' }
 * Assigns member ως leader/assistant στο department.
 *
 * Returns 409 αν assignment ήδη υπάρχει (composite PK).
 * Admin/President only.
 */
export async function POST(req: Request, { params }: RouteContext) {
  try {
    const ctx = await requireAdmin();
    const { departmentId } = await params;

    if (!departmentId) {
      return NextResponse.json(
        { error: "Λείπει departmentId" },
        { status: 400 }
      );
    }

    let body: { member_id?: string; role?: string };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return NextResponse.json(
        { error: "Μη έγκυρο JSON body" },
        { status: 400 }
      );
    }

    const { member_id, role } = body;

    if (!member_id || typeof member_id !== "string") {
      return NextResponse.json(
        { error: "Λείπει ή μη έγκυρο member_id" },
        { status: 400 }
      );
    }

    if (role !== "leader" && role !== "assistant") {
      return NextResponse.json(
        { error: "role πρέπει να είναι 'leader' ή 'assistant'" },
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

    // 2. Verify member belongs to user's club
    const memberCheck = await supabase
      .from("members")
      .select("id")
      .eq("id", member_id)
      .eq("club_id", ctx.clubId)
      .maybeSingle();

    if (memberCheck.error) {
      return NextResponse.json(
        { error: memberCheck.error.message },
        { status: 500 }
      );
    }
    if (!memberCheck.data) {
      return NextResponse.json(
        { error: "Το μέλος δεν βρέθηκε" },
        { status: 404 }
      );
    }

    // 3. Insert leader assignment (composite PK → conflict on duplicate)
    const payload: DepartmentLeaderInsert = {
      department_id: departmentId,
      member_id,
      role: role as "leader" | "assistant",
    };

    const insertRes = await supabase
      .from("department_leaders")
      .insert(payload)
      .select()
      .single();

    if (insertRes.error) {
      // PostgreSQL duplicate key error code = 23505
      if (insertRes.error.code === "23505") {
        return NextResponse.json(
          {
            error:
              "Το μέλος είναι ήδη ομαδάρχης σε αυτό το τμήμα",
          },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: insertRes.error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ leader: insertRes.data }, { status: 201 });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[POST department leader] error", err);
    return NextResponse.json(
      { error: "Σφάλμα διακομιστή" },
      { status: 500 }
    );
  }
}
