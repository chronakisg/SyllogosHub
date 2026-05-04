import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { getServerClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ memberId: string; roleId: string }> };

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireAdmin();
    const { memberId, roleId } = await params;

    const supabase = await getServerClient();

    const { data: member } = await supabase
      .from("members")
      .select("id")
      .eq("id", memberId)
      .eq("club_id", ctx.clubId)
      .maybeSingle();

    if (!member) {
      return NextResponse.json(
        { error: "Member not found στο club σας" },
        { status: 404 }
      );
    }

    const { error, count } = await supabase
      .from("member_role_assignments")
      .delete({ count: "exact" })
      .eq("member_id", memberId)
      .eq("role_id", roleId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (count === 0) {
      return NextResponse.json(
        { error: "Assignment δεν βρέθηκε" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, removed: count });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(
      "[DELETE /api/admin/users/[memberId]/roles/[roleId]]",
      e
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
