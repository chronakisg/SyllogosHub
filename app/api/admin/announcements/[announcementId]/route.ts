import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/requirePermission";
import { getServerClient } from "@/lib/supabase/server";
import { formatMemberName } from "@/lib/utils/attendees";
import type { AnnouncementUpdate } from "@/lib/supabase/types";

type Params = { params: Promise<{ announcementId: string }> };

// ─────────── PATCH: update announcement ───────────
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { announcementId } = await params;
    if (!announcementId) {
      return NextResponse.json(
        { error: "Λείπει announcementId" },
        { status: 400 }
      );
    }

    // 1. Parse body
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Μη έγκυρο JSON body" },
        { status: 400 }
      );
    }

    // 2. Initial soft-gate (read permission required για να query το record)
    const ctx = await requirePermission("announcements", { action: "read" });

    const supabase = await getServerClient();

    // 3. Load existing announcement (defensive club-scoped) — need
    //    department_id για scope-aware edit check παρακάτω.
    const { data: existing, error: loadErr } = await supabase
      .from("announcements")
      .select("id, department_id")
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

    // 4. Validate + extract update fields από body
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

    // Normalize new dept_id: undefined = no change, "" / null = becoming global
    const newDeptIdNormalized: string | null | undefined =
      department_id === undefined
        ? undefined
        : department_id === "" || department_id === null
          ? null
          : department_id;

    // 5. Edit permission check για existing announcement's audience
    const existingDeptId = existing.department_id;
    await (existingDeptId
      ? requirePermission("announcements", {
          action: "edit",
          resourceDepartmentId: existingDeptId,
        })
      : requirePermission("announcements", { action: "edit" }));

    // 6. Αν body αλλάζει το department_id (target audience),
    //    edit permission check για το νέο dept επίσης.
    const deptIsChanging =
      newDeptIdNormalized !== undefined &&
      newDeptIdNormalized !== existingDeptId;

    if (deptIsChanging) {
      await (newDeptIdNormalized
        ? requirePermission("announcements", {
            action: "edit",
            resourceDepartmentId: newDeptIdNormalized,
          })
        : requirePermission("announcements", { action: "edit" }));
    }

    // 7. Verify new dept belongs to club (αν provided & non-null)
    if (newDeptIdNormalized !== undefined && newDeptIdNormalized !== null) {
      const { data: dept, error: deptErr } = await supabase
        .from("departments")
        .select("id")
        .eq("id", newDeptIdNormalized)
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

    if (newDeptIdNormalized !== undefined) {
      updates.department_id = newDeptIdNormalized;
    }

    if (pinned !== undefined) updates.pinned = pinned;
    if (published !== undefined) updates.published = published;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "Δεν υπάρχουν αλλαγές προς αποθήκευση" },
        { status: 400 }
      );
    }

    // 8. Apply update
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
    const { announcementId } = await params;
    if (!announcementId) {
      return NextResponse.json(
        { error: "Λείπει announcementId" },
        { status: 400 }
      );
    }

    // 1. Initial soft-gate (read permission για να query record)
    const ctx = await requirePermission("announcements", { action: "read" });

    const supabase = await getServerClient();

    // 2. Load existing announcement (defensive club-scoped) — need
    //    department_id για scope-aware delete check παρακάτω.
    const { data: existing, error: loadErr } = await supabase
      .from("announcements")
      .select("id, title, department_id")
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

    // 3. Delete permission check για το existing audience
    const existingDeptId = existing.department_id;
    await (existingDeptId
      ? requirePermission("announcements", {
          action: "delete",
          resourceDepartmentId: existingDeptId,
        })
      : requirePermission("announcements", { action: "delete" }));

    // 4. Delete + return
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
