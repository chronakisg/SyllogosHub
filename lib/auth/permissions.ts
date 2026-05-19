/**
 * Permission domain logic — shared μεταξύ client (useRole hook)
 * και server (API route guards).
 *
 * Δεν περιέχει "use client" directive — pure data + utility
 * functions. Imports καθαρά types από @/lib/supabase/types.
 *
 * PR ζ.2: ScopedPermission type + dual computePermissions return.
 * Backward-compat: `permissions: Permission[]` παραμένει ως
 * derived view για τα 21 σημερινά call sites που χρησιμοποιούν
 * permissions.includes(). Scope-aware logic ζει στο `scoped` array.
 */

import type {
  MemberPermission,
  MemberRolePermission,
} from "@/lib/supabase/types";

export type Permission =
  | "finances"
  | "members"
  | "events"
  | "seating"
  | "calendar"
  | "settings"
  | "dashboard"
  | "cashier"
  | "audit"
  | "announcements";

export const ALL_PERMISSIONS: Permission[] = [
  "finances",
  "members",
  "events",
  "seating",
  "calendar",
  "settings",
  "dashboard",
  "cashier",
  "audit",
  "announcements",
];

// NOTE: PermissionAction + PermissionScope are also defined σε
// lib/supabase/types.ts (DB-derived). Identical literal unions →
// TS-compatible αλλά formally duplicate. Single-source unification
// deferred σε follow-up PR (see ROADMAP "Permission types unify"
// entry). Drift check: αν προστεθεί 5η action ή 4η scope, sync
// ΚΑΙ τα 2 places.
export type PermissionAction = "read" | "create" | "edit" | "delete";
export type PermissionScope = "all" | "own" | "department";

export const ALL_ACTIONS: PermissionAction[] = ["read", "create", "edit", "delete"];

/**
 * Rich permission representation — preserves module + action + scope
 * info από rolePermissions/customPermissions. Used by canDo() για
 * scope-aware checks και from PR ζ.4+ consumers.
 */
export type ScopedPermission = {
  module: Permission;
  action: PermissionAction;
  scope: PermissionScope;
  scope_department_id: string | null;
};

/**
 * Universal calendar grant: όλοι οι authenticated members βλέπουν
 * το /calendar route (read-only). Injected ως synthetic scoped row
 * για non-admins ώστε canDo('calendar', 'read') να return true
 * χωρίς ad-hoc special-casing στους consumers.
 */
const CALENDAR_GRANT: ScopedPermission = {
  module: "calendar",
  action: "read",
  scope: "all",
  scope_department_id: null,
};

/**
 * Resolve effective permissions από member flags + role assignments
 * + custom permissions.
 *
 * Returns:
 *   - permissions: Permission[] — unique module names (backward-compat
 *     για permissions.includes() call sites)
 *   - scoped: ScopedPermission[] — rich data για canDo + scope-aware
 *     consumers
 *
 * Short-circuit: isSystemAdmin || isPresident → full grant σε ΟΛΑ
 * τα modules × ΟΛΑ τα actions με scope='all'. Mirror του υπάρχοντος
 * behavior για τα 21 permissions.includes() sites + αξιοποιείται από
 * canDo για να επιστρέψει true χωρίς traversal.
 */
export function computePermissions(input: {
  isPresident: boolean;
  isSystemAdmin: boolean;
  rolePermissions: MemberRolePermission[];
  customPermissions: MemberPermission[];
}): {
  permissions: Permission[];
  scoped: ScopedPermission[];
} {
  // Admin/President: synthesize full-grant matrix
  if (input.isSystemAdmin || input.isPresident) {
    const scoped: ScopedPermission[] = ALL_PERMISSIONS.flatMap((module) =>
      ALL_ACTIONS.map((action) => ({
        module,
        action,
        scope: "all" as const,
        scope_department_id: null,
      }))
    );
    return { permissions: [...ALL_PERMISSIONS], scoped };
  }

  // Non-admin: union of role-based + custom permissions
  const scoped: ScopedPermission[] = [];

  for (const p of input.rolePermissions) {
    scoped.push({
      module: p.module as Permission,
      action: p.action as PermissionAction,
      scope: p.scope as PermissionScope,
      scope_department_id: p.scope_department_id,
    });
  }

  for (const p of input.customPermissions) {
    scoped.push({
      module: p.module as Permission,
      action: p.action as PermissionAction,
      scope: p.scope as PermissionScope,
      scope_department_id: p.scope_department_id,
    });
  }

  // Universal calendar grant (read-only)
  scoped.push(CALENDAR_GRANT);

  // Derive flat view: unique module strings από scoped
  const moduleSet = new Set<Permission>(scoped.map((s) => s.module));

  return {
    permissions: Array.from(moduleSet),
    scoped,
  };
}
