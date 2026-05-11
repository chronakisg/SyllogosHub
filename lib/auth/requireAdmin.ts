import { resolveAuthMember, type ResolvedMember } from "./resolveAuthMember";
import { errorResponse } from "./errorResponse";

export type AdminContext = ResolvedMember;

/**
 * Server-side guard για admin operations.
 * Throws Response (403) αν ο caller δεν είναι system admin
 * ή president. Auth/member resolution delegated to resolveAuthMember
 * (also throws 401/403/400 για auth/member/club_id failures).
 *
 * Επιστρέφει πλήρες context για use σε API routes.
 */
export async function requireAdmin(): Promise<AdminContext> {
  const resolved = await resolveAuthMember();

  if (!resolved.isSystemAdmin && !resolved.isPresident) {
    throw errorResponse("Admin privileges required", 403);
  }

  return resolved;
}
