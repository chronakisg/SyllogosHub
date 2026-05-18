import { NextRequest, NextResponse } from "next/server";
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

// ─────────── POST: create new announcement ───────────
export async function POST(req: NextRequest) {
  try {
    const ctx = await requirePermission("announcements");
    const body = await req.json();
    const {
      title,
      body: announcementBody,
      department_id,
      pinned,
      published,
    } = body as {
      title?: string;
      body?: string;
      department_id?: string | null;
      pinned?: boolean;
      published?: boolean;
    };

    // Validation
    if (!title || title.trim().length < 1) {
      return NextResponse.json(
        { error: "Ο τίτλος είναι υποχρεωτικός" },
        { status: 400 }
      );
    }
    if (!announcementBody || announcementBody.trim().length < 1) {
      return NextResponse.json(
        { error: "Το κείμενο είναι υποχρεωτικό" },
        { status: 400 }
      );
    }

    // Normalize empty string department_id → null
    const normalizedDeptId =
      department_id === "" || department_id === undefined
        ? null
        : department_id;

    const supabase = await getServerClient();

    // Validate department belongs to ctx.clubId (αν δοθεί)
    if (normalizedDeptId !== null) {
      const { data: dept, error: deptErr } = await supabase
        .from("departments")
        .select("id")
        .eq("id", normalizedDeptId)
        .eq("club_id", ctx.clubId)
        .maybeSingle();
      if (deptErr) {
        return NextResponse.json({ error: deptErr.message }, { status: 500 });
      }
      if (!dept) {
        return NextResponse.json(
          { error: "Άκυρο τμήμα" },
          { status: 400 }
        );
      }
    }

    // Insert
    const { data: row, error } = await supabase
      .from("announcements")
      .insert({
        club_id: ctx.clubId,
        created_by: ctx.memberId,
        title: title.trim(),
        body: announcementBody.trim(),
        department_id: normalizedDeptId,
        ...(pinned !== undefined && { pinned }),
        ...(published !== undefined && { published }),
      })
      .select(
        `id, title, body, pinned, published, created_at,
         department_id,
         departments ( id, name ),
         created_by,
         members!announcements_created_by_fkey ( first_name, last_name )`
      )
      .single();

    if (error) {
      console.error("[POST /api/admin/announcements] DB error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Flatten — same shape με GET response
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = row as any;
    const announcement = {
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
    };

    return NextResponse.json({ announcement });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[POST /api/admin/announcements]", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
