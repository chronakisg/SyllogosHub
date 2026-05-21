import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/requirePermission";
import { getServerClient } from "@/lib/supabase/server";
import { formatMemberName } from "@/lib/utils/attendees";
import type {
  AnnouncementAudienceInsert,
  AnnouncementAudienceType,
} from "@/lib/supabase/types";

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

/**
 * For backward compatibility with legacy reads, derive a single
 * department_id value to store στο announcements.department_id:
 * - If audiences contains exactly one 'department' και τίποτα άλλο → that dept id
 * - Otherwise → null (audiences is now the source of truth)
 */
function legacyDeptIdFromAudiences(audiences: AudienceSpec[]): string | null {
  if (audiences.length === 1 && audiences[0].type === "department") {
    return audiences[0].department_id;
  }
  return null;
}

/**
 * Validate permission για όλους τους audience types.
 * - global/board/leaders → require scope='all'
 * - department X → require scope='all' OR scope='department' for X
 */
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
    // requires scope='all'
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

// ─────────── GET: list all announcements του club ───────────

export async function GET() {
  try {
    const ctx = await requirePermission("announcements", { action: "read" });
    const supabase = await getServerClient();

    // Permission-scoped department filter (από PR ζ.2 engine)
    const annScoped = ctx.scoped.filter(
      (p) => p.module === "announcements" && p.action === "read"
    );
    const hasAllScope = annScoped.some((p) => p.scope === "all");
    const allowedDeptIds = hasAllScope
      ? null
      : annScoped
          .filter((p) => p.scope === "department" && p.scope_department_id)
          .map((p) => p.scope_department_id as string);

    if (!hasAllScope && allowedDeptIds && allowedDeptIds.length === 0) {
      return NextResponse.json({ announcements: [] });
    }

    // 1. Fetch all club announcements (audience-aware filter applied client-side)
    const { data: rowsRaw, error } = await supabase
      .from("announcements")
      .select(
        `id, title, body, pinned, published, created_at,
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
    const rows = (rowsRaw ?? []) as any[];
    const ids = rows.map((r) => r.id as string);
    const audiencesById = await fetchAudiencesByAnnouncementId(supabase, ids);

    // 2. Apply audience-aware scope filter:
    //    User με scope='all' βλέπει όλα. Με μόνο dept scopes, βλέπει
    //    ανακοινώσεις που έχουν audience σε department ∈ allowedDeptIds.
    const visible = rows.filter((r) => {
      if (hasAllScope) return true;
      const auds = audiencesById.get(r.id) ?? [];
      return auds.some(
        (a) =>
          a.type === "department" &&
          a.department_id &&
          allowedDeptIds?.includes(a.department_id)
      );
    });

    const announcements = visible.map((r) => ({
      id: r.id as string,
      title: r.title as string,
      body: r.body as string,
      pinned: r.pinned as boolean,
      published: r.published as boolean,
      created_at: r.created_at as string,
      audiences: audiencesById.get(r.id) ?? [],
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
    if (!Array.isArray(audiences) || audiences.length === 0) {
      return NextResponse.json(
        { error: "Επιλέξτε τουλάχιστον έναν αποδέκτη" },
        { status: 400 }
      );
    }
    const audSpecs: AudienceSpec[] = [];
    for (const a of audiences) {
      if (!isAudienceSpec(a)) {
        return NextResponse.json(
          { error: "Μη έγκυρη επιλογή αποδέκτη" },
          { status: 400 }
        );
      }
      audSpecs.push(a);
    }

    // 2. Permission checks για ALL audiences
    await checkAudiencePermissions(audSpecs, "create");

    // 3. Need ctx για clubId + memberId — re-request (idempotent)
    const ctx = await requirePermission("announcements", { action: "read" });
    const supabase = await getServerClient();

    // 4. Validate department audiences belong to club
    const deptIds = audSpecs
      .filter((a) => a.type === "department")
      .map((a) => (a as { department_id: string }).department_id);
    if (deptIds.length > 0) {
      const { data: depts, error: deptErr } = await supabase
        .from("departments")
        .select("id")
        .in("id", deptIds)
        .eq("club_id", ctx.clubId);
      if (deptErr) {
        return NextResponse.json({ error: deptErr.message }, { status: 500 });
      }
      const valid = new Set((depts ?? []).map((d) => d.id as string));
      if (deptIds.some((id) => !valid.has(id))) {
        return NextResponse.json(
          { error: "Άκυρο τμήμα" },
          { status: 400 }
        );
      }
    }

    // 5. Insert announcement (legacy department_id field για backward compat)
    const { data: row, error } = await supabase
      .from("announcements")
      .insert({
        club_id: ctx.clubId,
        created_by: ctx.memberId,
        title: title.trim(),
        body: announcementBody.trim(),
        department_id: legacyDeptIdFromAudiences(audSpecs),
        ...(pinned !== undefined && { pinned }),
        ...(published !== undefined && { published }),
      })
      .select(
        `id, title, body, pinned, published, created_at,
         created_by,
         members!announcements_created_by_fkey ( first_name, last_name )`
      )
      .single();

    if (error || !row) {
      console.error("[POST /api/admin/announcements] DB error:", error);
      return NextResponse.json(
        { error: error?.message ?? "Insert failed" },
        { status: 500 }
      );
    }

    // 6. Insert audience rows
    const audienceRows: AnnouncementAudienceInsert[] = audSpecs.map((a) =>
      a.type === "department"
        ? {
            announcement_id: row.id,
            audience_type: "department",
            department_id: a.department_id,
          }
        : {
            announcement_id: row.id,
            audience_type: a.type,
          }
    );
    const { error: audErr } = await supabase
      .from("announcement_audiences")
      .insert(audienceRows);
    if (audErr) {
      // Rollback: delete the announcement
      await supabase.from("announcements").delete().eq("id", row.id);
      console.error("[POST audience insert] DB error:", audErr);
      return NextResponse.json({ error: audErr.message }, { status: 500 });
    }

    // 7. Fetch audiences for response
    const audMap = await fetchAudiencesByAnnouncementId(supabase, [row.id]);
    const announcement = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      id: row.id as string,
      title: row.title as string,
      body: row.body as string,
      pinned: row.pinned as boolean,
      published: row.published as boolean,
      created_at: row.created_at as string,
      audiences: audMap.get(row.id) ?? [],
      created_by: row.created_by as string | null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      created_by_name: formatMemberName(row.members as any) || null,
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
