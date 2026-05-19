"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import type {
  MemberPermission,
  MemberRolePermission,
  PermissionAction,
  UserRoleName,
} from "@/lib/supabase/types";
import {
  type Permission,
  type ScopedPermission,
  computePermissions,
} from "@/lib/auth/permissions";

// Re-export για backward compat (AppShell.tsx imports Permission από useRole)
export type { Permission };

export type RoleState = {
  loading: boolean;
  userId: string | null;
  email: string | null;
  memberId: string | null;
  firstName: string | null;
  lastName: string | null;
  role: UserRoleName | null;
  isPresident: boolean;
  isSystemAdmin: boolean;
  isBoardMember: boolean;
  boardPosition: string | null;
  permissions: Permission[];
  scoped: ScopedPermission[];
  customPermissions: MemberPermission[];
  assignedRoles: { id: string; name: string }[];
  rolePermissions: MemberRolePermission[];
};

const INITIAL: RoleState = {
  loading: true,
  userId: null,
  email: null,
  memberId: null,
  firstName: null,
  lastName: null,
  role: null,
  isPresident: false,
  isSystemAdmin: false,
  isBoardMember: false,
  boardPosition: null,
  permissions: [],
  scoped: [],
  customPermissions: [],
  assignedRoles: [],
  rolePermissions: [],
};

const SIGNED_OUT: RoleState = { ...INITIAL, loading: false };

export type CanDoOpts = {
  resourceOwnerId?: string | null;
  resourceDepartmentId?: string | null;
};

export function canDo(
  state: RoleState,
  module: Permission,
  action: PermissionAction,
  opts: CanDoOpts = {}
): boolean {
  // Short-circuit: admin/president always allowed
  if (state.isSystemAdmin || state.isPresident) return true;

  // Iterate unified scoped permissions (role-based + custom +
  // synthetic calendar grant from computePermissions)
  for (const p of state.scoped) {
    if (p.module !== module) continue;
    if (p.action !== action) continue;

    if (p.scope === "all") return true;

    if (p.scope === "own") {
      if (state.memberId && opts.resourceOwnerId === state.memberId) {
        return true;
      }
    }

    if (p.scope === "department") {
      if (
        p.scope_department_id &&
        opts.resourceDepartmentId &&
        p.scope_department_id === opts.resourceDepartmentId
      ) {
        return true;
      }
    }
  }

  return false;
}

export function useRole(): RoleState {
  const [state, setState] = useState<RoleState>(INITIAL);

  useEffect(() => {
    let cancelled = false;
    const supabase = getBrowserClient();

    async function resolveRole(userId: string, email: string | null) {
      const lookupEmail = email?.trim() ?? null;
      try {
        const memRes = lookupEmail
          ? await supabase
              .from("members")
              .select(
                "id,first_name,last_name,email,is_president,is_system_admin,is_board_member,board_position"
              )
              .ilike("email", lookupEmail)
              .maybeSingle()
          : ({ data: null, error: null } as const);
        if (cancelled) return;

        const m = (memRes.data ?? null) as
          | {
              id: string;
              first_name: string | null;
              last_name: string | null;
              email: string | null;
              is_president: boolean | null;
              is_system_admin: boolean | null;
              is_board_member: boolean | null;
              board_position: string | null;
            }
          | null;

        const memberId = m?.id ?? null;
        const firstName = m?.first_name ?? null;
        const lastName = m?.last_name ?? null;
        const isPresident = !!m?.is_president;
        const isSystemAdmin = !!m?.is_system_admin;
        const isBoardMember = !!m?.is_board_member;
        const boardPosition = m?.board_position ?? null;

        let customPermissions: MemberPermission[] = [];
        let assignedRoles: { id: string; name: string }[] = [];
        let rolePermissions: MemberRolePermission[] = [];

        if (memberId) {
          const [permRes, assignmentRes] = await Promise.all([
            supabase
              .from("member_permissions")
              .select("*")
              .eq("member_id", memberId),
            supabase
              .from("member_role_assignments")
              .select(`
                role_id,
                member_roles!inner (
                  id,
                  name,
                  member_role_permissions (
                    id,
                    role_id,
                    module,
                    action,
                    scope,
                    scope_department_id,
                    created_at
                  )
                )
              `)
              .eq("member_id", memberId),
          ]);

          if (!cancelled) {
            if (!permRes.error) {
              customPermissions = (permRes.data ?? []) as MemberPermission[];
            }
            if (!assignmentRes.error && assignmentRes.data) {
              const data = assignmentRes.data as Array<{
                role_id: string;
                member_roles: {
                  id: string;
                  name: string;
                  member_role_permissions: MemberRolePermission[];
                };
              }>;
              assignedRoles = data.map((r) => ({
                id: r.member_roles.id,
                name: r.member_roles.name,
              }));
              rolePermissions = data.flatMap(
                (r) => r.member_roles.member_role_permissions ?? []
              );
            }
          }
        }
        if (cancelled) return;

        const { permissions, scoped } = computePermissions({
          isPresident,
          isSystemAdmin,
          rolePermissions,
          customPermissions,
        });

        setState({
          loading: false,
          userId,
          email,
          memberId,
          firstName,
          lastName,
          role: isSystemAdmin || isPresident ? "admin" : null,
          isPresident,
          isSystemAdmin,
          isBoardMember,
          boardPosition,
          permissions,
          scoped,
          customPermissions,
          assignedRoles,
          rolePermissions,
        });
      } catch (err) {
        console.error("[useRole] error", err);
        if (!cancelled) {
          setState({
            ...INITIAL,
            loading: false,
            userId,
            email,
          });
        }
      }
    }

    (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      const user = data.user;
      if (!user) {
        setState(SIGNED_OUT);
        return;
      }
      await resolveRole(user.id, user.email ?? null);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      if (!user) {
        setState(SIGNED_OUT);
        return;
      }
      setState((prev) => ({ ...prev, loading: true }));
      void resolveRole(user.id, user.email ?? null);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}

export function isAdmin(role: UserRoleName | null): boolean {
  return role === "admin";
}

export function hasPermission(state: RoleState, perm: Permission): boolean {
  return state.permissions.includes(perm);
}
