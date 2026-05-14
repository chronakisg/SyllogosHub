import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/requireSuperAdmin";
import { authEmailExists } from "@/lib/auth/findAuthUserByEmail";
import { getAdminClient } from "@/lib/supabase/admin";
import { seedClub } from "@/lib/admin/seedClub";
import { getResend, getFromEmail } from "@/lib/email/resend";
import { renderClubWelcomeEmail } from "@/lib/email/templates/clubWelcome";
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
  backupAdminEmail?: unknown;
  backupAdminPassword?: unknown;
  backupAdminFirstName?: unknown;
  backupAdminLastName?: unknown;
};

function isString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

// ─────────── POST: Create new club + bootstrap dual admin ───────────
export async function POST(req: NextRequest) {
  // Bookkeeping για partial-failure logging (steps 5-9 μετά το club insert).
  let createdClubId: string | undefined;
  let createdAuthUserId: string | undefined;
  let createdMemberId: string | undefined;
  let createdBackupAuthUserId: string | undefined;
  let createdBackupMemberId: string | undefined;

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
      backupAdminEmail,
      backupAdminPassword,
      backupAdminFirstName,
      backupAdminLastName,
    } = raw;

    if (
      !isString(name) ||
      !isString(slug) ||
      !isString(plan) ||
      !isString(adminEmail) ||
      !isString(adminPassword) ||
      !isString(adminFirstName) ||
      !isString(adminLastName) ||
      !isString(backupAdminEmail) ||
      !isString(backupAdminPassword) ||
      !isString(backupAdminFirstName) ||
      !isString(backupAdminLastName)
    ) {
      return NextResponse.json(
        {
          error:
            "Λείπουν required fields: name, slug, plan, adminEmail, adminPassword, adminFirstName, adminLastName, backupAdminEmail, backupAdminPassword, backupAdminFirstName, backupAdminLastName",
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
        { error: "Το password του Πρόεδρου πρέπει να έχει τουλάχιστον 8 χαρακτήρες" },
        { status: 400 },
      );
    }

    if (backupAdminPassword.length < 8) {
      return NextResponse.json(
        { error: "Το password του Backup Admin πρέπει να έχει τουλάχιστον 8 χαρακτήρες" },
        { status: 400 },
      );
    }

    // Reject if president and backup admin share the same email
    if (adminEmail.toLowerCase() === backupAdminEmail.toLowerCase()) {
      return NextResponse.json(
        {
          error:
            "Το email του Πρόεδρου και του Backup Admin πρέπει να είναι διαφορετικά",
        },
        { status: 400 },
      );
    }

    const admin = getAdminClient();

    // 3. Email collision check via paginated helper (αντικαθιστά το
    //    παλιό listUsers() χωρίς pagination — βλ. lib/auth/findAuthUserByEmail.ts)
    if (await authEmailExists(adminEmail)) {
      return NextResponse.json(
        { error: "Το email του Πρόεδρου ήδη υπάρχει" },
        { status: 409 },
      );
    }

    if (await authEmailExists(backupAdminEmail)) {
      return NextResponse.json(
        { error: "Το email του Backup Admin ήδη υπάρχει" },
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

    // 6. Create auth user (Πρόεδρος)
    const { data: createdUser, error: createUserError } =
      await admin.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
      });
    if (createUserError || !createdUser?.user) {
      throw createUserError ?? new Error("createUser (admin) returned no user");
    }
    createdAuthUserId = createdUser.user.id;

    // 6b. Create auth user (Backup Admin — SyllogosHub Recovery)
    const { data: createdBackupUser, error: createBackupUserError } =
      await admin.auth.admin.createUser({
        email: backupAdminEmail,
        password: backupAdminPassword,
        email_confirm: true,
      });
    if (createBackupUserError || !createdBackupUser?.user) {
      throw (
        createBackupUserError ??
        new Error("createUser (backup admin) returned no user")
      );
    }
    createdBackupAuthUserId = createdBackupUser.user.id;

    // 7. INSERT members row για Πρόεδρο + link σε auth.user (PR #62 fix)
    // Bootstrap admin πρέπει να έχει user_id linkage από day-1, αλλιώς
    // δεν μπορεί να κάνει login (proxy + portal flows require linkage).
    const { data: newMember, error: memberInsertError } = await admin
      .from("members")
      .insert({
        club_id: club.id,
        user_id: createdUser.user.id,
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

    // 7b. INSERT members row για Backup Admin (SyllogosHub Recovery)
    // is_hub_admin marker distinguishes από κανονικό admin. Δεν έχει
    // board flags (δεν είναι ΔΣ member του συλλόγου — είναι external recovery account).
    const { data: newBackupMember, error: backupMemberInsertError } =
      await admin
        .from("members")
        .insert({
          club_id: club.id,
          user_id: createdBackupUser.user.id,
          first_name: backupAdminFirstName,
          last_name: backupAdminLastName,
          email: backupAdminEmail,
          is_board_member: false,
          is_president: false,
          board_position: null,
          is_hub_admin: true,
        })
        .select("id")
        .single();
    if (backupMemberInsertError) throw backupMemberInsertError;
    if (!newBackupMember) {
      throw new Error("backup members insert returned no row");
    }
    createdBackupMemberId = newBackupMember.id;

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

    // 9. INSERT member_role_assignments — link both admins → "Πρόεδρος ΔΣ" role
    // Backup admin gets full president permissions για recovery scenarios.
    const { error: assignError } = await admin
      .from("member_role_assignments")
      .insert([
        {
          role_id: presidentRole.id,
          member_id: newMember.id,
          notes: "Auto-assigned: club bootstrap admin (Πρόεδρος)",
        },
        {
          role_id: presidentRole.id,
          member_id: newBackupMember.id,
          notes: "Auto-assigned: SyllogosHub Recovery (backup admin)",
        },
      ]);
    if (assignError) throw assignError;

    // 10. Welcome email (fail-soft — Resend outage ΔΕΝ blockάρει club creation)
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    let emailSent = false;
    try {
      const adminName = `${adminFirstName} ${adminLastName}`.trim();
      const { subject, html, text } = renderClubWelcomeEmail({
        clubName: club.name,
        adminName,
        adminEmail,
        appUrl,
      });
      const { error: sendError } = await getResend().emails.send({
        from: getFromEmail(),
        to: adminEmail,
        subject,
        html,
        text,
      });
      if (sendError) {
        console.warn(
          "[POST /api/admin/clubs] welcome email Resend error:",
          sendError,
        );
      } else {
        emailSent = true;
      }
    } catch (emailErr) {
      console.warn(
        "[POST /api/admin/clubs] welcome email threw:",
        emailErr,
      );
    }

    // 11. Success
    return NextResponse.json(
      {
        club,
        seedResult,
        adminUserId: createdAuthUserId,
        memberId: createdMemberId,
        backupAdminUserId: createdBackupAuthUserId,
        backupMemberId: createdBackupMemberId,
        emailSent,
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
          backupAuthUserId: createdBackupAuthUserId,
          backupMemberId: createdBackupMemberId,
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
            backupAuthUserId: createdBackupAuthUserId,
            backupMemberId: createdBackupMemberId,
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
