/**
 * Permission domain logic — shared μεταξύ client (useRole hook)
 * και server (API route guards).
 *
 * Δεν περιέχει "use client" directive — pure data + utility
 * functions. Imports καθαρά types από @/lib/supabase/types.
 */

import type {
  MemberPermission,
  MemberRolePermission,
  PermissionModule,
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

export const MODULE_TO_PERMISSION: Record<PermissionModule, Permission> = {
  calendar: "calendar",
  members: "members",
  finances: "finances",
  seating: "seating",
  events: "events",
  dashboard: "dashboard",
  settings: "settings",
  cashier: "cashier",
  audit: "audit",
  announcements: "announcements",
};

/**
 * Resolve effective Permission[] από member flags + role assignments
 * + custom permissions.
 *
 * Short-circuit: isSystemAdmin || isPresident → all permissions.
 * Always grants 'calendar' (universal access).
 */
export function computePermissions(input: {
  isPresident: boolean;
  isSystemAdmin: boolean;
  rolePermissions: MemberRolePermission[];
  customPermissions: MemberPermission[];
}): Permission[] {
  if (input.isSystemAdmin || input.isPresident) return [...ALL_PERMISSIONS];
  const set = new Set<Permission>();
  for (const p of input.rolePermissions) {
    const perm = MODULE_TO_PERMISSION[p.module as PermissionModule];
    if (perm) set.add(perm);
  }
  for (const p of input.customPermissions) {
    const perm = MODULE_TO_PERMISSION[p.module];
    if (perm) set.add(perm);
  }
  set.add("calendar");
  return Array.from(set);
}
