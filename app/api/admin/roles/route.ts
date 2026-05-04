import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { getServerClient } from "@/lib/supabase/server";

// ─────────── GET: list all roles του club with member + permission counts ───────────
export async function GET() {
  try {
    const ctx = await requireAdmin();
    const supabase = await getServerClient();

    const { data: rolesRaw, error } = await supabase
      .from("member_roles")
      .select(
        `id, name, description, is_system, display_order, created_at,
         member_role_assignments(count),
         member_role_permissions(count)`
      )
      .eq("club_id", ctx.clubId)
      .order("display_order");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const roles = (rolesRaw ?? []).map((r: any) => ({
      id: r.id as string,
      name: r.name as string,
      description: r.description as string | null,
      is_system: r.is_system as boolean,
      display_order: r.display_order as number,
      created_at: r.created_at as string,
      member_count: (r.member_role_assignments?.[0]?.count ?? 0) as number,
      permission_count: (r.member_role_permissions?.[0]?.count ?? 0) as number,
    }));

    return NextResponse.json({ roles });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[GET /api/admin/roles]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─────────── POST: create custom role ───────────
export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAdmin();
    const body = await req.json();
    const { name, description } = body as {
      name?: string;
      description?: string;
    };

    if (!name || name.trim().length < 2) {
      return NextResponse.json(
        { error: "Το όνομα πρέπει να έχει τουλάχιστον 2 χαρακτήρες" },
        { status: 400 }
      );
    }

    const supabase = await getServerClient();

    const { data: maxRow } = await supabase
      .from("member_roles")
      .select("display_order")
      .eq("club_id", ctx.clubId)
      .order("display_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextOrder = (maxRow?.display_order ?? 0) + 10;

    const { data: role, error } = await supabase
      .from("member_roles")
      .insert({
        club_id: ctx.clubId,
        name: name.trim(),
        description: description?.trim() ?? null,
        is_system: false,
        display_order: nextOrder,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "Υπάρχει ήδη ρόλος με αυτό το όνομα" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ role });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[POST /api/admin/roles]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
