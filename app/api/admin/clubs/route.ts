import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/requireSuperAdmin";
import { getAdminClient } from "@/lib/supabase/admin";
import { seedClub } from "@/lib/admin/seedClub";
import type { ClubCategory, ClubPlan } from "@/lib/supabase/types";

// ─────────── Validation rules ───────────
const VALID_PLANS: readonly ClubPlan[] = ["basic", "pro", "premium"] as const;
const VALID_CATEGORIES: readonly ClubCategory[] = [
  "traditional",
  "sports",
  "cultural",
  "professional",
  "friends",
  "other",
] as const;
// Slug: lowercase alphanumeric + hyphens between segments. Δεν επιτρέπει
// leading/trailing hyphens ή double hyphens.
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PG_UNIQUE_VIOLATION = "23505";

type CreateClubBody = {
  name?: unknown;
  slug?: unknown;
  plan?: unknown;
  adminEmail?: unknown;
  adminPassword?: unknown;
  adminFirstName?: unknown;
  adminLastName?: unknown;
  category?: unknown;
};

function isString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

// ─────────── POST: Create new club + bootstrap admin ───────────
export async function POST(req: NextRequest) {
  // Bookkeeping για partial-failure logging (steps 5-9 μετά το club insert).
  let createdClubId: string | undefined;
  let createdAuthUserId: string | undefined;
  let createdMemberId: string | undefined;

  try {
    // 1. Super-admin guard (throws 401/403 Response αν fail)
    await requireSuperAdmin();

    // 2. Validate body
    const raw = (await req.json().catch(() => null)) as CreateClubBody | null;
    if (!raw) {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }
    const {
      name,
      slug,
      plan,
      adminEmail,
      adminPassword,
      adminFirstName,
      adminLastName,
      category,
    } = raw;

    if (
      !isString(name) ||
      !isString(slug) ||
      !isString(plan) ||
      !isString(adminEmail) ||
      !isString(adminPassword) ||
      !isString(adminFirstName) ||
      !isString(adminLastName)
    ) {
      return NextResponse.json(
        {
          error:
            "Λείπουν required fields: name, slug, plan, adminEmail, adminPassword, adminFirstName, adminLastName",
        },
        { status: 400 },
      );
    }
    if (!SLUG_RE.test(slug)) {
      return NextResponse.json(
        {
          error:
            "Invalid slug — μόνο lowercase alphanumeric + hyphens μεταξύ segments",
        },
        { status: 400 },
      );
    }
    if (!VALID_PLANS.includes(plan as ClubPlan)) {
      return NextResponse.json(
        { error: `Invalid plan — αποδεκτές τιμές: ${VALID_PLANS.join(", ")}` },
        { status: 400 },
      );
    }
    const hasCategory = category !== undefined;
    if (hasCategory) {
      if (
        !isString(category) ||
        !VALID_CATEGORIES.includes(category as ClubCategory)
      ) {
        return NextResponse.json(
          {
            error: `Invalid category — αποδεκτές τιμές: ${VALID_CATEGORIES.join(", ")}`,
          },
          { status: 400 },
        );
      }
    }
    if (adminPassword.length < 8) {
      return NextResponse.json(
        { error: "Το password πρέπει να έχει τουλάχιστον 8 χαρακτήρες" },
        { status: 400 },
      );
    }

    const admin = getAdminClient();

    // 3. Email collision check (mirror του login route pattern)
    const emailLower = adminEmail.toLowerCase();
    const { data: usersList, error: listError } =
      await admin.auth.admin.listUsers();
    if (listError) throw listError;
    if (
      usersList?.users.some((u) => u.email?.toLowerCase() === emailLower)
    ) {
      return NextResponse.json(
        { error: "Email ήδη υπάρχει" },
        { status: 409 },
      );
    }

    // 4. INSERT clubs (duplicate slug → 409, άλλα errors propagate)
    const { data: club, error: clubError } = await admin
      .from("clubs")
      .insert({
        name,
        slug,
        plan: plan as ClubPlan,
        is_active: true,
        ...(hasCategory && { category: category as ClubCategory }),
      })
      .select("id, name, slug, plan, is_active, created_at, category")
      .single();
    if (clubError) {
      if (clubError.code === PG_UNIQUE_VIOLATION) {
        return NextResponse.json(
          { error: "Slug ήδη υπάρχει" },
          { status: 409 },
        );
      }
      throw clubError;
    }
    if (!club) {
      throw new Error("clubs insert returned no row");
    }
    createdClubId = club.id;

    // ── Από εδώ και κάτω, το club ΥΠΑΡΧΕΙ. Όλα τα errors → 500 με ──
    // ── context για manual cleanup. Δες catch handler στο τέλος.    ──

    // 5. Seed default data (roles, permissions, ticket/expense categories,
    //    club_settings). Errors propagate.
    const seedResult = await seedClub(club.id);

    // 6. Create auth user
    const { data: createdUser, error: createUserError } =
      await admin.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
      });
    if (createUserError || !createdUser?.user) {
      throw createUserError ?? new Error("createUser returned no user");
    }
    createdAuthUserId = createdUser.user.id;

    // 7. INSERT members row για τον bootstrap admin
    const { data: newMember, error: memberInsertError } = await admin
      .from("members")
      .insert({
        club_id: club.id,
        first_name: adminFirstName,
        last_name: adminLastName,
        email: adminEmail,
        is_board_member: true,
        is_president: true,
        board_position: "Πρόεδρος",
      })
      .select("id")
      .single();
    if (memberInsertError) throw memberInsertError;
    if (!newMember) throw new Error("members insert returned no row");
    createdMemberId = newMember.id;

    // 8. Ψάξε το "Πρόεδρος ΔΣ" role του νέου club (seeded από step 5)
    const { data: presidentRole, error: roleLookupError } = await admin
      .from("member_roles")
      .select("id")
      .eq("club_id", club.id)
      .eq("name", "Πρόεδρος ΔΣ")
      .maybeSingle();
    if (roleLookupError) throw roleLookupError;
    if (!presidentRole) {
      throw new Error(
        `Πρόεδρος ΔΣ role δεν βρέθηκε για το νέο club ${club.id} (seedClub broke;)`,
      );
    }

    // 9. INSERT member_role_assignments — link bootstrap member → role
    const { error: assignError } = await admin
      .from("member_role_assignments")
      .insert({
        role_id: presidentRole.id,
        member_id: newMember.id,
        notes: "Auto-assigned: club bootstrap admin",
      });
    if (assignError) throw assignError;

    // 10. Success
    return NextResponse.json(
      {
        club,
        seedResult,
        adminUserId: createdAuthUserId,
        memberId: createdMemberId,
      },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof Response) return e;

    // Partial failure path: club δημιουργήθηκε αλλά κάτι μετά απέτυχε.
    // Logging για manual cleanup (super admin πρέπει να αποφασίσει
    // αν θα διαγράψει το half-bootstrapped club ή θα συμπληρώσει χειροκίνητα).
    if (createdClubId) {
      console.error(
        "[POST /api/admin/clubs] partial failure — manual cleanup needed",
        {
          clubId: createdClubId,
          authUserId: createdAuthUserId,
          memberId: createdMemberId,
          error: e,
        },
      );
      return NextResponse.json(
        {
          error:
            "Το club δημιουργήθηκε αλλά κάποιο επόμενο βήμα απέτυχε. Δες server logs για cleanup context.",
          context: {
            clubId: createdClubId,
            authUserId: createdAuthUserId,
            memberId: createdMemberId,
          },
        },
        { status: 500 },
      );
    }

    console.error("[POST /api/admin/clubs]", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
