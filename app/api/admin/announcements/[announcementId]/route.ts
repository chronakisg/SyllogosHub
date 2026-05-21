import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/requirePermission";
import { getServerClient } from "@/lib/supabase/server";
import { formatMemberName } from "@/lib/utils/attendees";
import type {
  AnnouncementAudienceInsert,
  AnnouncementAudienceType,
  AnnouncementUpdate,
} from "@/lib/supabase/types";

type Params = { params: Promise<{ announcementId: string }> };

// ─────────── Types ───────────

type AudienceSpec =
  | { type: "global" }
  | { type: "board" }
  | { type: "leaders" }
  | { type: "department"; department_id: string };

type AudienceItem = {
  type: AnnouncementAudienceType;
  department_id: string | null;
  department_name: string | null;
};

// ─────────── Helpers ───────────

function isAudienceSpec(x: unknown): x is AudienceSpec {
  if (!x || typeof x !== "object") return false;
  const t = (x as { type?: unknown }).type;
  if (t === "global" || t === "board" || t === "leaders") return true;
  if (t === "department") {
    const id = (x as { department_id?: unknown }).department_id;
    return typeof id === "string" && id.length > 0;
  }
  return false;
}

function legacyDeptIdFromAudiences(audiences: AudienceSpec[]): string | null {
  if (audiences.length === 1 && audiences[0].type === "department") {
    return audiences[0].department_id;
  }
  return null;
}

async function checkAudiencePermissions(
  audiences: AudienceSpec[],
  action: "create" | "edit" | "delete"
) {
  const deptIds = audiences
    .filter((a) => a.type === "department")
    .map((a) => (a as { department_id: string }).department_id);
  const hasUniversal = audiences.some(
    (a) => a.type === "global" || a.type === "board" || a.type === "leaders"
  );

  if (hasUniversal) {
    await requirePermission("announcements", { action });
  }
  for (const deptId of deptIds) {
    await requirePermission("announcements", {
      action,
      resourceDepartmentId: deptId,
    });
  }
}

async function fetchAudiencesByAnnouncementId(
  supabase: Awaited<ReturnType<typeof getServerClient>>,
  announcementIds: string[]
): Promise<Map<string, AudienceItem[]>> {
  const result = new Map<string, AudienceItem[]>();
  if (announcementIds.length === 0) return result;

  const { data, error } = await supabase
    .from("announcement_audiences")
    .select("announcement_id, audience_type, department_id, departments(name)")
    .in("announcement_id", announcementIds);
  if (error) {
    console.error("fetchAudiencesByAnnouncementId failed:", error);
    return result;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (data ?? []) as any[]) {
    const list = result.get(r.announcement_id) ?? [];
    list.push({
      type: r.audience_type as AnnouncementAudienceType,
      department_id: r.department_id as string | null,
      department_name: (r.departments?.name ?? null) as string | null,
    });
    result.set(r.announcement_id, list);
  }
  return result;
}

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

    // 3. Load existing announcement (defensive club-scoped)
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

    // 4. Load existing audiences (για edit permission check)
    const existingAudMap = await fetchAudiencesByAnnouncementId(supabase, [
      announcementId,
    ]);
    const existingAudiences: AudienceSpec[] = (
      existingAudMap.get(announcementId) ?? []
    ).map((a) =>
      a.type === "department" && a.department_id
        ? { type: "department", department_id: a.department_id }
        : { type: a.type as "global" | "board" | "leaders" }
    );

    // 5. Parse update fields
    const {
      title,
      body: announcementBody,
      audiences,
      pinned,
      published,
    } = body as {
      title?: string;
      body?: string;
      audiences?: unknown;
      pinned?: boolean;
      published?: boolean;
    };

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

    // 6. Parse audiences (αν δοθεί)
    let newAudiences: AudienceSpec[] | null = null;
    if (audiences !== undefined) {
      if (!Array.isArray(audiences) || audiences.length === 0) {
        return NextResponse.json(
          { error: "Επιλέξτε τουλάχιστον έναν αποδέκτη" },
          { status: 400 }
        );
      }
      const parsed: AudienceSpec[] = [];
      for (const a of audiences) {
        if (!isAudienceSpec(a)) {
          return NextResponse.json(
            { error: "Μη έγκυρη επιλογή αποδέκτη" },
            { status: 400 }
          );
        }
        parsed.push(a);
      }
      newAudiences = parsed;
    }

    // 7. Permission checks: edit για existing + edit για new
    await checkAudiencePermissions(existingAudiences, "edit");
    if (newAudiences) {
      await checkAudiencePermissions(newAudiences, "edit");

      // Validate new department audiences belong to club
      const newDeptIds = newAudiences
        .filter((a) => a.type === "department")
        .map((a) => (a as { department_id: string }).department_id);
      if (newDeptIds.length > 0) {
        const { data: depts, error: deptErr } = await supabase
          .from("departments")
          .select("id")
          .in("id", newDeptIds)
          .eq("club_id", ctx.clubId);
        if (deptErr) {
          return NextResponse.json({ error: deptErr.message }, { status: 500 });
        }
        const valid = new Set((depts ?? []).map((d) => d.id as string));
        if (newDeptIds.some((id) => !valid.has(id))) {
          return NextResponse.json(
            { error: "Άκυρο τμήμα" },
            { status: 400 }
          );
        }
      }

      // Update legacy department_id για backward compat
      updates.department_id = legacyDeptIdFromAudiences(newAudiences);
    }

    if (pinned !== undefined) updates.pinned = pinned;
    if (published !== undefined) updates.published = published;

    if (Object.keys(updates).length === 0 && newAudiences === null) {
      return NextResponse.json(
        { error: "Δεν υπάρχουν αλλαγές προς αποθήκευση" },
        { status: 400 }
      );
    }

    // 8. Apply announcement update (αν υπάρχουν fields)
    if (Object.keys(updates).length > 0) {
      const { error } = await supabase
        .from("announcements")
        .update(updates)
        .eq("id", announcementId);
      if (error) {
        console.error(
          "[PATCH /api/admin/announcements/[id]] DB error:",
          error
        );
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    // 9. Sync audiences (delete-and-insert)
    if (newAudiences) {
      const { error: delErr } = await supabase
        .from("announcement_audiences")
        .delete()
        .eq("announcement_id", announcementId);
      if (delErr) {
        return NextResponse.json({ error: delErr.message }, { status: 500 });
      }
      const audienceRows: AnnouncementAudienceInsert[] = newAudiences.map((a) =>
        a.type === "department"
          ? {
              announcement_id: announcementId,
              audience_type: "department",
              department_id: a.department_id,
            }
          : {
              announcement_id: announcementId,
              audience_type: a.type,
            }
      );
      const { error: insErr } = await supabase
        .from("announcement_audiences")
        .insert(audienceRows);
      if (insErr) {
        return NextResponse.json({ error: insErr.message }, { status: 500 });
      }
    }

    // 10. Fetch updated announcement + audiences for response
    const { data: row, error: fetchErr } = await supabase
      .from("announcements")
      .select(
        `id, title, body, pinned, published, created_at,
         created_by,
         members!announcements_created_by_fkey ( first_name, last_name )`
      )
      .eq("id", announcementId)
      .single();
    if (fetchErr || !row) {
      return NextResponse.json(
        { error: fetchErr?.message ?? "Fetch failed" },
        { status: 500 }
      );
    }
    const audMap = await fetchAudiencesByAnnouncementId(supabase, [
      announcementId,
    ]);

    const announcement = {
      id: row.id as string,
      title: row.title as string,
      body: row.body as string,
      pinned: row.pinned as boolean,
      published: row.published as boolean,
      created_at: row.created_at as string,
      audiences: audMap.get(announcementId) ?? [],
      created_by: row.created_by as string | null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      created_by_name: formatMemberName(row.members as any) || null,
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
// audiences cascade-delete via FK ON DELETE CASCADE

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { announcementId } = await params;
    if (!announcementId) {
      return NextResponse.json(
        { error: "Λείπει announcementId" },
        { status: 400 }
      );
    }

    const ctx = await requirePermission("announcements", { action: "read" });
    const supabase = await getServerClient();

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

    // Delete permission check για existing audiences
    const audMap = await fetchAudiencesByAnnouncementId(supabase, [
      announcementId,
    ]);
    const existingAudiences: AudienceSpec[] = (
      audMap.get(announcementId) ?? []
    ).map((a) =>
      a.type === "department" && a.department_id
        ? { type: "department", department_id: a.department_id }
        : { type: a.type as "global" | "board" | "leaders" }
    );
    await checkAudiencePermissions(existingAudiences, "delete");

    const { error } = await supabase
      .from("announcements")
      .delete()
      .eq("id", announcementId);

    if (error) {
      console.error(
        "[DELETE /api/admin/announcements/[id]] DB error:",
        error
      );
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
