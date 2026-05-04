import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { getServerClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ memberId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireAdmin();
    const { memberId } = await params;
    const body = await req.json();
    const { roleId, notes } = body as { roleId?: string; notes?: string };

    if (!roleId) {
      return NextResponse.json(
        { error: "roleId απαιτείται" },
        { status: 400 }
      );
    }

    const supabase = await getServerClient();

    const { data: member } = await supabase
      .from("members")
      .select("id, club_id")
      .eq("id", memberId)
      .eq("club_id", ctx.clubId)
      .maybeSingle();

    if (!member) {
      return NextResponse.json(
        { error: "Member not found στο club σας" },
        { status: 404 }
      );
    }

    const { data: role } = await supabase
      .from("member_roles")
      .select("id, club_id, name")
      .eq("id", roleId)
      .eq("club_id", ctx.clubId)
      .maybeSingle();

    if (!role) {
      return NextResponse.json(
        { error: "Role not found στο club σας" },
        { status: 404 }
      );
    }

    const { data: assignment, error } = await supabase
      .from("member_role_assignments")
      .insert({
        role_id: roleId,
        member_id: memberId,
        assigned_by: ctx.memberId,
        notes: notes ?? null,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "Ο ρόλος είναι ήδη ανατεθειμένος σε αυτό το μέλος" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      assignmentId: assignment.id,
      roleName: role.name,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[POST /api/admin/users/[memberId]/roles]", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
