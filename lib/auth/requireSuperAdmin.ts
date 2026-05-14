import type { User } from "@supabase/supabase-js";
import { getAdminClient } from "../supabase/admin";
import { getServerClient } from "../supabase/server";
import { errorResponse } from "./errorResponse";

export type SuperAdminContext = {
  user: User;
};

/**
 * Server-side guard για platform-level (cross-club) operations.
 * Throws Response (401/403) αν ο caller δεν είναι super_admin.
 *
 * Διαφορά από requireAdmin:
 *   - requireAdmin → per-club admin (is_president | is_system_admin)
 *   - requireSuperAdmin → platform-level (super_admins table)
 *
 * Χρησιμοποιεί:
 *   - getServerClient (cookie-based) για το session user
 *   - getAdminClient (service role) για το super_admins lookup,
 *     consistent με τα υπόλοιπα admin operations του project
 */
export async function requireSuperAdmin(): Promise<SuperAdminContext> {
  const supabase = await getServerClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw errorResponse("Unauthorized", 401);
  }

  const admin = getAdminClient();
  const { data: superAdmin, error: lookupError } = await admin
    .from("super_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (lookupError) {
    throw errorResponse("Super-admin lookup failed", 500);
  }

  if (!superAdmin) {
    throw errorResponse("Super-admin privileges required", 403);
  }

  return { user };
}
