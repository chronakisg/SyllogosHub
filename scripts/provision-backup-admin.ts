#!/usr/bin/env tsx
/**
 * provision-backup-admin.ts
 *
 * Standalone CLI script για provisioning του SyllogosHub Recovery
 * backup admin σε ΥΠΑΡΧΟΝ club. Mirror του POST /api/admin/clubs
 * Steps 6b/7b/8/9 flow.
 *
 * Use case: kriton-aigaleo (και άλλα pre-PR-β' clubs) δεν έχουν
 * backup admin. Νέα clubs (post-PR β') auto-get dual admins μέσω
 * /admin/clubs/new form.
 *
 * Idempotent: αν το club ήδη έχει backup admin (is_hub_admin=true),
 * skip silently και exit success.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/provision-backup-admin.ts --club-slug=<slug>
 *
 * Required env vars (loaded από .env.local via tsx --env-file flag):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Known issue (Windows local dev): libuv async cleanup assertion
 * appears AFTER script logic completes. Exit code may show 127
 * instead of 0/1. Functionally inert — production (Linux) unaffected.
 */

import { getAdminClient } from "@/lib/supabase/admin";
import { authEmailExists } from "@/lib/auth/findAuthUserByEmail";
import { generatePassword } from "@/lib/utils/password";

// ─── CLI Argument Parsing ─────────────────────────────────────

function parseArgs(): { clubSlug: string } {
  const args = process.argv.slice(2);
  const slugArg = args.find((a) => a.startsWith("--club-slug="));

  if (!slugArg) {
    console.error(
      "Usage: npx tsx --env-file=.env.local scripts/provision-backup-admin.ts --club-slug=<slug>",
    );
    process.exit(1);
  }

  const clubSlug = slugArg.split("=")[1];
  if (!clubSlug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(clubSlug)) {
    console.error("❌ Invalid slug format. Use lowercase alphanumeric + hyphens.");
    process.exit(1);
  }

  return { clubSlug };
}

// ─── Main ──────────────────────────────────────────────────────

async function main() {
  const { clubSlug } = parseArgs();
  const admin = getAdminClient();

  // Bookkeeping για partial-failure logging
  let createdAuthUserId: string | undefined;
  let createdMemberId: string | undefined;

  try {
    console.log(`\n🔍 Resolving club: ${clubSlug}...`);

    // 1. SELECT club by slug
    const { data: club, error: clubError } = await admin
      .from("clubs")
      .select("id, name, slug")
      .eq("slug", clubSlug)
      .maybeSingle();

    if (clubError) throw clubError;
    if (!club) {
      console.error(`❌ Club not found: ${clubSlug}`);
      process.exit(1);
    }

    console.log(`   ✓ Club: ${club.name} (${club.id})`);

    // 2. Idempotency check — backup admin already exists;
    console.log(`\n🔍 Checking for existing backup admin...`);
    const { data: existingBackup, error: backupCheckError } = await admin
      .from("members")
      .select("id, email")
      .eq("club_id", club.id)
      .eq("is_hub_admin", true)
      .maybeSingle();

    if (backupCheckError) throw backupCheckError;
    if (existingBackup) {
      console.log(`\n✓ Backup admin already exists for ${clubSlug}:`);
      console.log(`   Email: ${existingBackup.email}`);
      console.log(`\n   No action needed. Script idempotent.`);
      process.exit(0);
    }

    console.log(`   ✓ No existing backup admin. Proceeding με provisioning.`);

    // 3. Generate credentials
    const backupEmail = `info@${clubSlug}.syllogoshub.gr`;
    const backupPassword = generatePassword(16);

    console.log(`\n📧 Backup email: ${backupEmail}`);

    // 4. Defensive collision check (auth.users layer)
    console.log(`\n🔍 Checking auth.users for email collision...`);
    if (await authEmailExists(backupEmail)) {
      console.error(
        `❌ auth.users already has entry for ${backupEmail}. ` +
          `Possible orphan από previous failed run. ` +
          `Manual cleanup required (Supabase Auth UI).`,
      );
      process.exit(1);
    }
    console.log(`   ✓ No collision.`);

    // 5. Create auth user
    console.log(`\n👤 Creating auth user...`);
    const { data: createdUser, error: createUserError } =
      await admin.auth.admin.createUser({
        email: backupEmail,
        password: backupPassword,
        email_confirm: true,
      });

    if (createUserError || !createdUser?.user) {
      throw createUserError ?? new Error("createUser returned no user");
    }
    createdAuthUserId = createdUser.user.id;
    console.log(`   ✓ Auth user: ${createdAuthUserId}`);

    // 6. INSERT members row
    console.log(`\n👥 Creating members row...`);
    const { data: newMember, error: memberInsertError } = await admin
      .from("members")
      .insert({
        club_id: club.id,
        user_id: createdUser.user.id,
        first_name: "SyllogosHub",
        last_name: "Recovery",
        email: backupEmail,
        is_board_member: false,
        is_president: false,
        board_position: null,
        is_hub_admin: true,
      })
      .select("id")
      .single();

    if (memberInsertError) throw memberInsertError;
    if (!newMember) throw new Error("members insert returned no row");
    createdMemberId = newMember.id;
    console.log(`   ✓ Member: ${createdMemberId}`);

    // 7. SELECT "Πρόεδρος ΔΣ" role
    console.log(`\n🔑 Looking up "Πρόεδρος ΔΣ" role...`);
    const { data: presidentRole, error: roleLookupError } = await admin
      .from("member_roles")
      .select("id")
      .eq("club_id", club.id)
      .eq("name", "Πρόεδρος ΔΣ")
      .maybeSingle();

    if (roleLookupError) throw roleLookupError;
    if (!presidentRole) {
      throw new Error(
        `"Πρόεδρος ΔΣ" role not found for club ${club.id}. ` +
          `Club may not be properly seeded (seedClub broken;).`,
      );
    }
    console.log(`   ✓ Role: ${presidentRole.id}`);

    // 8. INSERT member_role_assignments
    console.log(`\n🔗 Assigning role...`);
    const { error: assignError } = await admin
      .from("member_role_assignments")
      .insert({
        role_id: presidentRole.id,
        member_id: newMember.id,
        notes: "Auto-assigned: SyllogosHub Recovery (provisioned via script)",
      });

    if (assignError) throw assignError;
    console.log(`   ✓ Role assignment created.`);

    // 9. Verification SELECT
    console.log(`\n✓ Verifying provisioning...`);
    const { data: verifyMember } = await admin
      .from("members")
      .select("id, email, is_hub_admin")
      .eq("id", newMember.id)
      .single();

    const { data: verifyAssignment } = await admin
      .from("member_role_assignments")
      .select("id, role_id, member_id")
      .eq("member_id", newMember.id)
      .single();

    if (!verifyMember?.is_hub_admin || !verifyAssignment) {
      throw new Error("Post-creation verification failed");
    }

    // 10. SUCCESS — Print credentials με clear markers
    console.log("\n");
    console.log("═══════════════════════════════════════════════════");
    console.log(`✓ Backup admin provisioned for: ${club.slug}`);
    console.log("");
    console.log(`  Club:     ${club.name}`);
    console.log(`  Email:    ${backupEmail}`);
    console.log(`  Password: ${backupPassword}`);
    console.log("");
    console.log("⚠️  COPY ABOVE INTO 1PASSWORD NOW.");
    console.log("   This password will NOT be shown again.");
    console.log("   Recommended vault: 'SyllogosHub Recovery'");
    console.log(`   Entry name: ${clubSlug}`);
    console.log("═══════════════════════════════════════════════════");
    console.log("\n");

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Script failed:", error);

    if (createdAuthUserId || createdMemberId) {
      console.error("\n⚠️  PARTIAL FAILURE — Manual cleanup required:");
      if (createdAuthUserId) {
        console.error(`   auth.users.id: ${createdAuthUserId}`);
        console.error(`   → Delete via Supabase Auth UI`);
      }
      if (createdMemberId) {
        console.error(`   members.id: ${createdMemberId}`);
        console.error(
          `   → DELETE FROM members WHERE id = '${createdMemberId}';`,
        );
      }
    }

    process.exit(1);
  }
}

main();
