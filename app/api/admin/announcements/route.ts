import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/requirePermission";
import { getServerClient } from "@/lib/supabase/server";
import { formatMemberName } from "@/lib/utils/attendees";

// ─────────── GET: list all announcements του club ───────────
export async function GET() {
  try {
    const ctx = await requirePermission("announcements");
    const supabase = await getServerClient();

    const { data: rowsRaw, error } = await supabase
      .from("announcements")
      .select(
        `id, title, body, pinned, published, created_at,
         department_id,
         departments ( id, name ),
         created_by,
         members!announcements_created_by_fkey ( first_name, last_name )`
      )
      .eq("club_id", ctx.clubId)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[GET /api/admin/announcements] DB error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const announcements = (rowsRaw ?? []).map((r: any) => ({
      id: r.id as string,
      title: r.title as string,
      body: r.body as string,
      pinned: r.pinned as boolean,
      published: r.published as boolean,
      created_at: r.created_at as string,
      department_id: r.department_id as string | null,
      department_name: (r.departments?.name ?? null) as string | null,
      created_by: r.created_by as string | null,
      created_by_name: formatMemberName(r.members) || null,
    }));

    return NextResponse.json({ announcements });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[GET /api/admin/announcements]", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
