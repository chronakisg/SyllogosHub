"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import type {
  MemberPermission,
  PermissionAction,
  PermissionModule,
  UserRoleName,
} from "@/lib/supabase/types";

export type Permission =
  | "finances"
  | "members"
  | "events"
  | "seating"
  | "calendar"
  | "settings"
  | "dashboard";

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
  customPermissions: MemberPermission[];
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
  customPermissions: [],
};

const SIGNED_OUT: RoleState = { ...INITIAL, loading: false };

const ALL_PERMISSIONS: Permission[] = [
  "finances",
  "members",
  "events",
  "seating",
  "calendar",
  "settings",
  "dashboard",
];

const MODULE_TO_PERMISSION: Record<PermissionModule, Permission> = {
  calendar: "calendar",
  members: "members",
  finances: "finances",
  seating: "seating",
  events: "events",
  dashboard: "dashboard",
  settings: "settings",
};

function legacyBoardPositionPermissions(input: {
  isBoardMember: boolean;
  boardPosition: string | null;
}): Permission[] {
  if (input.boardPosition === "Ταμίας") return ["finances", "dashboard"];
  if (input.boardPosition === "Γραμματέας")
    return ["members", "calendar", "dashboard"];
  if (input.boardPosition === "Αντιπρόεδρος")
    return ["members", "events", "seating", "calendar", "dashboard"];
  if (input.isBoardMember) return ["members", "seating", "calendar"];
  return ["calendar"];
}

function computePermissions(input: {
  isPresident: boolean;
  isSystemAdmin: boolean;
  isBoardMember: boolean;
  boardPosition: string | null;
  customPermissions: MemberPermission[];
}): Permission[] {
  if (input.isSystemAdmin || input.isPresident) return [...ALL_PERMISSIONS];
  if (input.customPermissions.length > 0) {
    const set = new Set<Permission>();
    for (const p of input.customPermissions) {
      const perm = MODULE_TO_PERMISSION[p.module];
      if (perm) set.add(perm);
    }
    set.add("calendar");
    return Array.from(set);
  }
  return legacyBoardPositionPermissions(input);
}

export type CanDoOpts = {
  resourceOwnerId?: string | null;
  resourceDepartment?: string | null;
};

export function canDo(
  state: RoleState,
  module: PermissionModule,
  action: PermissionAction,
  opts: CanDoOpts = {}
): boolean {
  if (state.isSystemAdmin || state.isPresident) return true;
  for (const p of state.customPermissions) {
    if (p.module !== module) continue;
    if (p.action !== action) continue;
    if (p.scope === "all") return true;
    if (p.scope === "own") {
      if (state.memberId && opts.resourceOwnerId === state.memberId) return true;
    }
    if (p.scope === "department") {
      if (
        p.scope_value &&
        opts.resourceDepartment &&
        p.scope_value === opts.resourceDepartment
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
        const [memRes, roleRes] = await Promise.all([
          lookupEmail
            ? supabase
                .from("members")
                .select(
                  "id,first_name,last_name,email,is_president,is_system_admin,is_board_member,board_position"
                )
                .ilike("email", lookupEmail)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null } as const),
          supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", userId)
            .maybeSingle(),
        ]);
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
        if (memberId) {
          const permRes = await supabase
            .from("member_permissions")
            .select("*")
            .eq("member_id", memberId);
          if (!cancelled && !permRes.error) {
            customPermissions = (permRes.data ?? []) as MemberPermission[];
          }
        }
        if (cancelled) return;

        const tableRole =
          roleRes.error || !roleRes.data
            ? null
            : ((roleRes.data as { role: UserRoleName }).role ?? null);

        const permissions = computePermissions({
          isPresident,
          isSystemAdmin,
          isBoardMember,
          boardPosition,
          customPermissions,
        });

        setState({
          loading: false,
          userId,
          email,
          memberId,
          firstName,
          lastName,
          role: isSystemAdmin || isPresident ? "admin" : tableRole,
          isPresident,
          isSystemAdmin,
          isBoardMember,
          boardPosition,
          permissions,
          customPermissions,
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

export function canAccessFinances(role: UserRoleName | null): boolean {
  return role === "admin" || role === "treasurer";
}

export function hasPermission(state: RoleState, perm: Permission): boolean {
  return state.permissions.includes(perm);
}
