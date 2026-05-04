import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { getAdminClient } from "@/lib/supabase/admin";
import { getServerClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ memberId: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireAdmin();
    const { memberId } = await params;

    const supabase = await getServerClient();
    const { data: member } = await supabase
      .from("members")
      .select("id, email")
      .eq("id", memberId)
      .eq("club_id", ctx.clubId)
      .maybeSingle();

    if (!member || !member.email) {
      return NextResponse.json(
        { error: "Member ή email δεν βρέθηκε" },
        { status: 404 }
      );
    }

    const admin = getAdminClient();
    const { data: list } = await admin.auth.admin.listUsers();
    const authUser = list?.users.find(
      (u) => u.email?.toLowerCase() === member.email!.toLowerCase()
    );

    if (!authUser) {
      return NextResponse.json(
        { error: "Δεν υπάρχει auth account" },
        { status: 404 }
      );
    }

    const { error } = await admin.auth.admin.updateUserById(authUser.id, {
      ban_duration: "none",
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, enabled: true });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[POST /api/admin/users/[memberId]/login/enable]", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
