import { resolveAuthMember, type ResolvedMember } from "./resolveAuthMember";
import { errorResponse } from "./errorResponse";
import {
  type Permission,
  type PermissionAction,
  type ScopedPermission,
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
 * επιπλέον τα computed permissions:
 * - permissions: flat module list (backward-compat για secondary
 *   .includes() checks ή audit logging context)
 * - scoped: rich permission data για consumers που χρειάζονται
 *   scope-aware secondary checks (e.g. department-filtered queries)
 */
export type PermissionContext = ResolvedMember & {
  permissions: Permission[];
  scoped: ScopedPermission[];
};

/**
 * Optional scope-tightening για requirePermission. Όταν δίνονται
 * opts.action ή opts.resourceDepartmentId, ο check γίνεται
 * scope-aware:
 * - opts.action: user χρειάζεται permission με αυτό το exact action
 *   (όχι απλά module-level access)
 * - opts.resourceDepartmentId: αν δίνεται, scope='department'
 *   permissions ικανοποιούνται μόνο αν match-άρει το dept_id
 *
 * Χωρίς opts → legacy module-only OR check (backward-compat για
 * variadic call sites).
 *
 * Note: 'own' scope server-side enforcement deferred — conservative
 * reject. Future PR θα προσθέσει opts.resourceOwnerId.
 */
export type RequirePermissionOpts = {
  action?: PermissionAction;
  resourceDepartmentId?: string;
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
// Overload #1: Legacy variadic form (backward-compat για existing calls).
// Requires at least 1 permission — enforced at compile time.
export async function requirePermission(
  permission: Permission,
  ...rest: Permission[]
): Promise<PermissionContext>;

// Overload #2: Single permission + scope-aware opts (new canonical form)
export async function requirePermission(
  permission: Permission,
  opts: RequirePermissionOpts
): Promise<PermissionContext>;

// Implementation
export async function requirePermission(
  ...args:
    | [Permission, ...Permission[]]
    | [Permission, RequirePermissionOpts]
): Promise<PermissionContext> {
  // 0. Detect call form και extract perms + opts
  //    Variadic legacy: (perm1, perm2, ...)  → opts είναι {}
  //    New canonical:   (perm, { action?, resourceDepartmentId? })
  let perms: Permission[];
  let opts: RequirePermissionOpts = {};

  const last = args[args.length - 1];
  const isOptsForm =
    args.length === 2 &&
    typeof last === "object" &&
    last !== null &&
    !Array.isArray(last);

  if (isOptsForm) {
    perms = [args[0] as Permission];
    opts = last as RequirePermissionOpts;
  } else {
    perms = args as Permission[];
  }

  // Defensive guard (όχι reachable με τη νέα overload, αλλά υπάρχει
  // για safety σε runtime call patterns που bypass-άρουν types)
  if (perms.length === 0) {
    throw errorResponse(
      "requirePermission called με κενό permissions array",
      500
    );
  }

  // 1. Auth + member resolution (shared foundation)
  const resolved = await resolveAuthMember();

  // 2. Short-circuit για admin/president (skip DB queries)
  //    Synthesize full-grant scoped matrix για consistency με
  //    computePermissions admin path — caller του context μπορεί
  //    να κάνει secondary scope checks ομοιόμορφα.
  if (resolved.isSystemAdmin || resolved.isPresident) {
    const adminScoped: ScopedPermission[] = ALL_PERMISSIONS.flatMap(
      (module) =>
        (["read", "create", "edit", "delete"] as PermissionAction[]).map(
          (action) => ({
            module,
            action,
            scope: "all" as const,
            scope_department_id: null,
          })
        )
    );
    return {
      ...resolved,
      permissions: [...ALL_PERMISSIONS],
      scoped: adminScoped,
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
  const { permissions: userPermissions, scoped } = computePermissions({
    isPresident: resolved.isPresident,
    isSystemAdmin: resolved.isSystemAdmin,
    rolePermissions,
    customPermissions,
  });

  // 7. Permission check — dual path
  let hasAny: boolean;

  if (opts.action || opts.resourceDepartmentId) {
    // Scope-aware path: tighten check με action + dept matching
    hasAny = perms.some((requiredModule) =>
      scoped.some((p) => {
        if (p.module !== requiredModule) return false;
        if (opts.action && p.action !== opts.action) return false;

        if (p.scope === "all") return true;

        if (p.scope === "department") {
          return !!(
            opts.resourceDepartmentId &&
            p.scope_department_id === opts.resourceDepartmentId
          );
        }

        // 'own' scope: server-side enforcement defers to future PR
        // (needs opts.resourceOwnerId param). Conservative reject.
        return false;
      })
    );
  } else {
    // Legacy module-only path (backward-compat για variadic calls)
    hasAny = perms.some((p) => userPermissions.includes(p));
  }

  if (!hasAny) {
    const scopeHint =
      opts.action || opts.resourceDepartmentId
        ? ` (action: ${opts.action ?? "any"}${
            opts.resourceDepartmentId ? `, dept: ${opts.resourceDepartmentId}` : ""
          })`
        : "";
    throw errorResponse(
      `Λείπει δικαίωμα: ${perms.join(" ή ")}${scopeHint}`,
      403
    );
  }

  // 8. Return enriched context με ΚΑΙ τα 2 view shapes
  return {
    ...resolved,
    permissions: userPermissions,
    scoped,
  };
}
