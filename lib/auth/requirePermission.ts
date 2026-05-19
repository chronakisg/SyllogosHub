import { resolveAuthMember, type ResolvedMember } from "./resolveAuthMember";
import { errorResponse } from "./errorResponse";
import {
  type Permission,
  ALL_PERMISSIONS,
  computePermissions,
} from "./permissions";
import { getServerClient } from "@/lib/supabase/server";
import type {
  MemberPermission,
  MemberRolePermission,
} from "@/lib/supabase/types";

/**
 * Auth context returned από requirePermission — superset του
 * ResolvedMember (πεδία authentication + member resolution) με
 * επιπλέον το computed permissions array για secondary checks
 * ή audit logging context.
 */
export type PermissionContext = ResolvedMember & {
  permissions: Permission[];
};

/**
 * Server-side permission gate για admin API routes.
 *
 * Throws Response (όχι Error) on failure — clean propagation σε
 * Next.js route handlers. Failure modes inheritance από
 * resolveAuthMember:
 * - 401: No authenticated user
 * - 403: User authenticated αλλά no matching member
 * - 400: Member found αλλά no club_id
 *
 * Plus permission-specific:
 * - 403: Member lacks ALL of the required permissions
 * - 500: DB error during permission lookup
 * - 500: Called με κενό permissions array (bug guard)
 *
 * Variadic OR logic: αν 2+ permissions δοθούν, ο user χρειάζεται
 * ΕΣΤΩ 1 για να περάσει. Για AND logic, κάνε compose 2 calls.
 *
 * Short-circuit: isSystemAdmin || isPresident → ALL_PERMISSIONS
 * granted (skip 2 DB queries για perf, mirror του useRole behavior).
 *
 * Usage:
 *   const ctx = await requirePermission("events");
 *   // ctx.memberId, ctx.clubId, ctx.permissions available
 *
 *   const ctx = await requirePermission("events", "finances");
 *   // either grants access (OR logic)
 */
export async function requirePermission(
  ...permissions: Permission[]
): Promise<PermissionContext> {
  if (permissions.length === 0) {
    throw errorResponse(
      "requirePermission called με κενό permissions array",
      500
    );
  }

  // 1. Auth + member resolution (shared foundation)
  const resolved = await resolveAuthMember();

  // 2. Short-circuit για admin/president (skip DB queries)
  if (resolved.isSystemAdmin || resolved.isPresident) {
    return {
      ...resolved,
      permissions: [...ALL_PERMISSIONS],
    };
  }

  // 3. Permission resolution: 2 parallel queries (mirror useRole)
  const supabase = await getServerClient();
  const [permRes, assignmentRes] = await Promise.all([
    supabase
      .from("member_permissions")
      .select("*")
      .eq("member_id", resolved.memberId),
    supabase
      .from("member_role_assignments")
      .select(`
        role_id,
        member_roles!inner (
          id,
          name,
          member_role_permissions (
            id, role_id, module, action, scope, scope_department_id, created_at
          )
        )
      `)
      .eq("member_id", resolved.memberId),
  ]);

  // 4. Surface DB errors loudly (vs useRole silent ignore — server
  //    context requires explicit failure since user attempted gated action)
  if (permRes.error) {
    throw errorResponse(
      `Permissions lookup failed: ${permRes.error.message}`,
      500
    );
  }
  if (assignmentRes.error) {
    throw errorResponse(
      `Role assignments lookup failed: ${assignmentRes.error.message}`,
      500
    );
  }

  // 5. Flatten role permissions από nested join
  const customPermissions = (permRes.data ?? []) as MemberPermission[];
  const assignmentRows = (assignmentRes.data ?? []) as Array<{
    role_id: string;
    member_roles: {
      id: string;
      name: string;
      member_role_permissions: MemberRolePermission[];
    };
  }>;
  const rolePermissions = assignmentRows.flatMap(
    (r) => r.member_roles?.member_role_permissions ?? []
  );

  // 6. Compute permissions using shared logic
  const userPermissions = computePermissions({
    isPresident: resolved.isPresident,
    isSystemAdmin: resolved.isSystemAdmin,
    rolePermissions,
    customPermissions,
  });

  // 7. OR check: user needs at least 1 of the required permissions
  const hasAny = permissions.some((p) => userPermissions.includes(p));
  if (!hasAny) {
    throw errorResponse(
      `Λείπει δικαίωμα: ${permissions.join(" ή ")}`,
      403
    );
  }

  // 8. Return enriched context
  return {
    ...resolved,
    permissions: userPermissions,
  };
}
