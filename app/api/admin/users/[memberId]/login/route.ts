import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { getAdminClient } from "@/lib/supabase/admin";
import { getServerClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ memberId: string }> };

// ─────────── Helpers ───────────
async function loadMember(memberId: string, clubId: string) {
  const supabase = await getServerClient();
  const { data, error } = await supabase
    .from("members")
    .select("id, club_id, email, first_name, last_name")
    .eq("id", memberId)
    .eq("club_id", clubId)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

// ─────────── GET: Login status ───────────
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireAdmin();
    const { memberId } = await params;

    const member = await loadMember(memberId, ctx.clubId);
    if (!member || !member.email) {
      return NextResponse.json({ hasLogin: false, banned: false, lastSignIn: null });
    }

    const admin = getAdminClient();
    const { data: list } = await admin.auth.admin.listUsers();
    const authUser = list?.users.find(
      (u) => u.email?.toLowerCase() === member.email!.toLowerCase()
    );

    if (!authUser) {
      return NextResponse.json({ hasLogin: false, banned: false, lastSignIn: null });
    }

    const bannedUntil = authUser.banned_until as string | undefined;
    const banned = !!bannedUntil && new Date(bannedUntil) > new Date();
    const lastSignIn = authUser.last_sign_in_at ?? null;

    return NextResponse.json({ hasLogin: true, banned, lastSignIn });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[GET /api/admin/users/[memberId]/login]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─────────── POST: Create login ───────────
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireAdmin();
    const { memberId } = await params;
    const body = await req.json();
    const { email, password } = body as { email?: string; password?: string };

    if (!email || !password) {
      return NextResponse.json(
        { error: "email και password απαιτούνται" },
        { status: 400 }
      );
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Το password πρέπει να έχει τουλάχιστον 8 χαρακτήρες" },
        { status: 400 }
      );
    }

    const member = await loadMember(memberId, ctx.clubId);
    if (!member) {
      return NextResponse.json(
        { error: "Member not found στο club σας" },
        { status: 404 }
      );
    }

    const admin = getAdminClient();

    const { data: existingList } = await admin.auth.admin.listUsers();
    const existing = existingList?.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );

    if (existing) {
      return NextResponse.json(
        { error: "Υπάρχει ήδη auth account με αυτό το email" },
        { status: 409 }
      );
    }

    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (createError || !created.user) {
      return NextResponse.json(
        {
          error:
            createError?.message ?? "Αποτυχία δημιουργίας auth account",
        },
        { status: 500 }
      );
    }

    if (member.email?.toLowerCase() !== email.toLowerCase()) {
      await admin.from("members").update({ email }).eq("id", memberId);
    }

    return NextResponse.json({
      authUserId: created.user.id,
      email: created.user.email,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[POST /api/admin/users/[memberId]/login]", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ─────────── PATCH: Reset password ───────────
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireAdmin();
    const { memberId } = await params;
    const body = await req.json();
    const { password } = body as { password?: string };

    if (!password || password.length < 8) {
      return NextResponse.json(
        { error: "Το password πρέπει να έχει τουλάχιστον 8 χαρακτήρες" },
        { status: 400 }
      );
    }

    const member = await loadMember(memberId, ctx.clubId);
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
        { error: "Δεν υπάρχει auth account για αυτόν τον member" },
        { status: 404 }
      );
    }

    const { error: updateError } = await admin.auth.admin.updateUserById(
      authUser.id,
      { password }
    );

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[PATCH /api/admin/users/[memberId]/login]", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ─────────── DELETE: Disable login ───────────
// ΔΕΝ διαγράφουμε τον auth user (preservation of audit history).
// Ban-άρουμε τον user και sign-out όλες τις sessions του.
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const ctx = await requireAdmin();
    const { memberId } = await params;

    const member = await loadMember(memberId, ctx.clubId);
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

    const { error: banError } = await admin.auth.admin.updateUserById(
      authUser.id,
      { ban_duration: "876000h" }
    );

    if (banError) {
      return NextResponse.json({ error: banError.message }, { status: 500 });
    }

    await admin.auth.admin.signOut(authUser.id);

    return NextResponse.json({ success: true, disabled: true });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("[DELETE /api/admin/users/[memberId]/login]", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
