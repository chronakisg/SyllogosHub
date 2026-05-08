import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/requireSuperAdmin";
import { getAdminClient } from "@/lib/supabase/admin";
import type { ClubModule } from "@/lib/supabase/types";
import { CORE_CLUB_MODULES } from "@/lib/supabase/types";

type Params = { params: Promise<{ id: string }> };

const VALID_MODULES: readonly ClubModule[] = [
  "members",
  "events",
  "seating",
  "finances",
  "cashier",
  "calendar",
  "communications",
] as const;

type PatchBody = {
  module?: unknown;
  enabled?: unknown;
};

function isString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requireSuperAdmin();
    const { id } = await params;

    const admin = getAdminClient();
    const { data, error } = await admin
      .from("club_modules")
      .select("module, enabled")
      .eq("club_id", id)
      .order("module");

    if (error) throw error;

    return NextResponse.json({ modules: data ?? [] });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[GET /api/admin/clubs/[id]/modules]", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    await requireSuperAdmin();
    const { id } = await params;

    const raw = (await req.json().catch(() => null)) as PatchBody | null;
    if (!raw) {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const { module, enabled } = raw;

    if (!isString(module) || !VALID_MODULES.includes(module as ClubModule)) {
      return NextResponse.json(
        {
          error: `Invalid module — αποδεκτές τιμές: ${VALID_MODULES.join(", ")}`,
        },
        { status: 400 },
      );
    }

    if (typeof enabled !== "boolean") {
      return NextResponse.json(
        { error: "enabled πρέπει να είναι boolean" },
        { status: 400 },
      );
    }

    const moduleTyped = module as ClubModule;

    if (CORE_CLUB_MODULES.includes(moduleTyped) && !enabled) {
      return NextResponse.json(
        {
          error: `Το module "${moduleTyped}" είναι core και δεν απενεργοποιείται`,
        },
        { status: 400 },
      );
    }

    const admin = getAdminClient();
    const { data, error } = await admin
      .from("club_modules")
      .upsert(
        { club_id: id, module: moduleTyped, enabled },
        { onConflict: "club_id,module" },
      )
      .select("module, enabled")
      .single();

    if (error) throw error;

    return NextResponse.json({ module: data });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[PATCH /api/admin/clubs/[id]/modules]", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
