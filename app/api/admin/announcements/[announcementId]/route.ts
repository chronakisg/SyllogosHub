import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/requirePermission";
import { getServerClient } from "@/lib/supabase/server";
import { formatMemberName } from "@/lib/utils/attendees";
import type { AnnouncementUpdate } from "@/lib/supabase/types";

type Params = { params: Promise<{ announcementId: string }> };

// ─────────── PATCH: update announcement ───────────
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const ctx = await requirePermission("announcements");
    const { announcementId } = await params;
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

    const supabase = await getServerClient();

    // Load-first με scope check (anti-cross-tenant)
    const { data: existing, error: loadErr } = await supabase
      .from("announcements")
      .select("id")
      .eq("id", announcementId)
      .eq("club_id", ctx.clubId)
      .maybeSingle();
    if (loadErr) {
      return NextResponse.json({ error: loadErr.message }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json(
        { error: "Η ανακοίνωση δεν βρέθηκε" },
        { status: 404 }
      );
    }

    // Build partial update object
    const updates: AnnouncementUpdate = {};

    if (title !== undefined) {
      if (title.trim().length < 1) {
        return NextResponse.json(
          { error: "Ο τίτλος δεν μπορεί να είναι κενός" },
          { status: 400 }
        );
      }
      updates.title = title.trim();
    }

    if (announcementBody !== undefined) {
      if (announcementBody.trim().length < 1) {
        return NextResponse.json(
          { error: "Το κείμενο δεν μπορεί να είναι κενό" },
          { status: 400 }
        );
      }
      updates.body = announcementBody.trim();
    }

    if (department_id !== undefined) {
      const normalized =
        department_id === "" || department_id === null ? null : department_id;
      if (normalized !== null) {
        const { data: dept, error: deptErr } = await supabase
          .from("departments")
          .select("id")
          .eq("id", normalized)
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
      updates.department_id = normalized;
    }

    if (pinned !== undefined) updates.pinned = pinned;
    if (published !== undefined) updates.published = published;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "Δεν υπάρχουν αλλαγές προς αποθήκευση" },
        { status: 400 }
      );
    }

    // Apply update
    const { data: row, error } = await supabase
      .from("announcements")
      .update(updates)
      .eq("id", announcementId)
      .select(
        `id, title, body, pinned, published, created_at,
         department_id,
         departments ( id, name ),
         created_by,
         members!announcements_created_by_fkey ( first_name, last_name )`
      )
      .single();

    if (error) {
      console.error("[PATCH /api/admin/announcements/[id]] DB error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

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
    console.error("[PATCH /api/admin/announcements/[id]]", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ─────────── DELETE: hard delete announcement ───────────
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const ctx = await requirePermission("announcements");
    const { announcementId } = await params;
    const supabase = await getServerClient();

    // Load-first με scope check + title για response
    const { data: existing, error: loadErr } = await supabase
      .from("announcements")
      .select("id, title")
      .eq("id", announcementId)
      .eq("club_id", ctx.clubId)
      .maybeSingle();
    if (loadErr) {
      return NextResponse.json({ error: loadErr.message }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json(
        { error: "Η ανακοίνωση δεν βρέθηκε" },
        { status: 404 }
      );
    }

    const { error } = await supabase
      .from("announcements")
      .delete()
      .eq("id", announcementId);

    if (error) {
      console.error("[DELETE /api/admin/announcements/[id]] DB error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      deleted: existing.title,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[DELETE /api/admin/announcements/[id]]", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
