import { getServerClient } from "../supabase/server";

export type AdminContext = {
  userId: string;
  email: string;
  memberId: string;
  clubId: string;
  isSystemAdmin: boolean;
  isPresident: boolean;
};

/**
 * Server-side guard για admin operations.
 * Throws Response (403/401) αν ο caller δεν είναι system admin
 * ή president.
 *
 * Επιστρέφει πλήρες context για use σε API routes.
 */
export async function requireAdmin(): Promise<AdminContext> {
  const supabase = await getServerClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user || !user.email) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: member, error: memberError } = await supabase
    .from("members")
    .select("id, club_id, is_system_admin, is_president")
    .ilike("email", user.email)
    .maybeSingle();

  if (memberError || !member) {
    throw new Response(
      JSON.stringify({ error: "Member record not found" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!member.is_system_admin && !member.is_president) {
    throw new Response(
      JSON.stringify({ error: "Admin privileges required" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!member.club_id) {
    throw new Response(
      JSON.stringify({ error: "Club context missing" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
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
