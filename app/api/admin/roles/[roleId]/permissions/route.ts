import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { getServerClient } from "@/lib/supabase/server";
import type {
  PermissionModule,
  PermissionAction,
  PermissionScope,
} from "@/lib/supabase/types";

type Params = { params: Promise<{ roleId: string }> };

// ─────────── GET: list permissions for a role ───────────
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireAdmin();
    const { roleId } = await params;

    const supabase = await getServerClient();

    const { data: role } = await supabase
      .from("member_roles")
      .select("id")
      .eq("id", roleId)
      .eq("club_id", ctx.clubId)
      .maybeSingle();

    if (!role) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }

    const { data: permissions, error } = await supabase
      .from("member_role_permissions")
      .select("*")
      .eq("role_id", roleId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ permissions: permissions ?? [] });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[GET /api/admin/roles/[roleId]/permissions]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─────────── PATCH: full replace permissions (delete + insert) ───────────
// Body: { permissions: Array<{ module, action, scope, scope_value? }> }
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireAdmin();
    const { roleId } = await params;
    const body = await req.json();
    const { permissions } = body as {
      permissions?: Array<{
        module: string;
        action: string;
        scope: string;
        scope_value?: string | null;
      }>;
    };

    if (!Array.isArray(permissions)) {
      return NextResponse.json(
        { error: "permissions array απαιτείται" },
        { status: 400 }
      );
    }

    const supabase = await getServerClient();

    const { data: role } = await supabase
      .from("member_roles")
      .select("id")
      .eq("id", roleId)
      .eq("club_id", ctx.clubId)
      .maybeSingle();

    if (!role) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }

    for (const p of permissions) {
      if (!p.module || !p.action || !p.scope) {
        return NextResponse.json(
          { error: "Κάθε permission πρέπει να έχει module, action, scope" },
          { status: 400 }
        );
      }
      if (p.scope === "department" && !p.scope_value?.trim()) {
        return NextResponse.json(
          { error: "Department scope απαιτεί scope_value" },
          { status: 400 }
        );
      }
    }

    const { error: deleteError } = await supabase
      .from("member_role_permissions")
      .delete()
      .eq("role_id", roleId);

    if (deleteError) {
      return NextResponse.json(
        { error: `Delete failed: ${deleteError.message}` },
        { status: 500 }
      );
    }

    if (permissions.length > 0) {
      const inserts = permissions.map((p) => ({
        role_id: roleId,
        module: p.module as PermissionModule,
        action: p.action as PermissionAction,
        scope: p.scope as PermissionScope,
        scope_value: p.scope_value?.trim() || null,
      }));

      const { error: insertError } = await supabase
        .from("member_role_permissions")
        .insert(inserts);

      if (insertError) {
        return NextResponse.json(
          { error: `Insert failed: ${insertError.message}` },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true, count: permissions.length });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[PATCH /api/admin/roles/[roleId]/permissions]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
