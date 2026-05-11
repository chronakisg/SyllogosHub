import { getServerClient } from "@/lib/supabase/server";
import { errorResponse } from "./errorResponse";

/**
 * Resolved auth + member context — κοινό payload μεταξύ
 * requireAdmin και requirePermission helpers.
 *
 * Member resolution γίνεται μέσω case-insensitive email match
 * (mirror του useRole client pattern). user.email είναι
 * guaranteed από auth.getUser για authenticated users.
 */
export type ResolvedMember = {
  userId: string;
  email: string;
  memberId: string;
  clubId: string;
  isSystemAdmin: boolean;
  isPresident: boolean;
};

/**
 * Auth + member resolution helper για server-side API routes.
 *
 * Throws Response (not Error) on failure — clean propagation σε
 * Next.js route handlers.
 *
 * Failure modes:
 * - 401: No authenticated user (missing session ή expired token)
 * - 403: User authenticated αλλά no matching member found
 * - 400: Member found αλλά no club_id (orphaned member state)
 *
 * On success: returns ResolvedMember με κάθε field guaranteed
 * to be non-null/non-empty.
 */
export async function resolveAuthMember(): Promise<ResolvedMember> {
  const supabase = await getServerClient();

  // 1. Auth check
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || !user.email) {
    throw errorResponse("Unauthenticated", 401);
  }

  // 2. Member lookup via case-insensitive email match
  const { data: member, error: memberError } = await supabase
    .from("members")
    .select(
      "id, club_id, is_system_admin, is_president"
    )
    .ilike("email", user.email)
    .maybeSingle();

  if (memberError) {
    throw errorResponse(
      `Member lookup failed: ${memberError.message}`,
      500
    );
  }

  if (!member) {
    throw errorResponse("Δεν υπάρχει αντίστοιχο μέλος", 403);
  }

  if (!member.club_id) {
    throw errorResponse(
      "Member missing club context",
      400
    );
  }

  return {
    userId: user.id,
    email: user.email,
    memberId: member.id,
    clubId: member.club_id,
    isSystemAdmin: member.is_system_admin ?? false,
    isPresident: member.is_president ?? false,
  };
}
