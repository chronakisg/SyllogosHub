import { getAdminClient } from "@/lib/supabase/admin";
import type {
  PermissionAction,
  PermissionModule,
  PermissionScope,
} from "@/lib/supabase/types";

export type SeedResult = {
  roles: number;
  permissions: number;
  ticketCategories: number;
  expenseCategories: number;
  clubSettings: boolean;
};

// ============================================================
// Default seed data
// ----------------------------------------------------
// Mirror των migrations 0005 / 0006 / 0010. Αν αλλάξει
// εκεί κάτι, πρέπει να αλλάξει και εδώ (single source of
// truth για νέα clubs που δεν υπήρχαν στο migration time).
// ============================================================

const DEFAULT_ROLES = [
  {
    name: "Πρόεδρος ΔΣ",
    description: "Πλήρης πρόσβαση στο σύστημα",
    display_order: 10,
  },
  {
    name: "Αντιπρόεδρος",
    description: "Διαχείριση μελών, εκδηλώσεων, πλάνου",
    display_order: 20,
  },
  {
    name: "Ταμίας",
    description: "Διαχείριση οικονομικών και ταμείου εκδηλώσεων",
    display_order: 30,
  },
  {
    name: "Γραμματέας",
    description: "Διαχείριση μελών και ημερολογίου",
    display_order: 40,
  },
  {
    name: "Μέλος ΔΣ",
    description: "Ανάγνωση μελών, πλάνου και ημερολογίου",
    display_order: 50,
  },
  {
    name: "Απλό Μέλος",
    description: "Βασική πρόσβαση: ημερολόγιο και προβολή εκδηλώσεων",
    display_order: 100,
  },
] as const;

type RoleName = (typeof DEFAULT_ROLES)[number]["name"];

const ALL_ACTIONS: readonly PermissionAction[] = [
  "read",
  "create",
  "edit",
  "delete",
] as const;

const PRESIDENT_MODULES: readonly PermissionModule[] = [
  "calendar",
  "members",
  "finances",
  "seating",
  "events",
  "dashboard",
  "settings",
  "cashier",
] as const;

type PermissionRow = {
  role_id: string;
  module: PermissionModule;
  action: PermissionAction;
  scope: PermissionScope;
};

function buildPermissionsForRole(
  roleId: string,
  roleName: RoleName,
): PermissionRow[] {
  const rows: PermissionRow[] = [];

  const cross = (
    modules: readonly PermissionModule[],
    actions: readonly PermissionAction[],
  ) => {
    for (const m of modules) {
      for (const a of actions) {
        rows.push({ role_id: roleId, module: m, action: a, scope: "all" });
      }
    }
  };

  switch (roleName) {
    case "Πρόεδρος ΔΣ":
      cross(PRESIDENT_MODULES, ALL_ACTIONS);
      break;
    case "Αντιπρόεδρος":
      cross(
        ["members", "events", "seating", "calendar"] as const,
        ALL_ACTIONS,
      );
      rows.push({
        role_id: roleId,
        module: "dashboard",
        action: "read",
        scope: "all",
      });
      break;
    case "Ταμίας":
      cross(["finances", "cashier"] as const, ALL_ACTIONS);
      rows.push({
        role_id: roleId,
        module: "dashboard",
        action: "read",
        scope: "all",
      });
      break;
    case "Γραμματέας":
      cross(["members", "calendar"] as const, ALL_ACTIONS);
      rows.push({
        role_id: roleId,
        module: "dashboard",
        action: "read",
        scope: "all",
      });
      break;
    case "Μέλος ΔΣ":
      cross(
        ["members", "seating", "calendar", "events"] as const,
        ["read"] as const,
      );
      break;
    case "Απλό Μέλος":
      cross(["calendar", "events"] as const, ["read"] as const);
      break;
  }

  return rows;
}

const TICKET_CATEGORIES = [
  {
    name: "Ενήλικας",
    short_label: "Ενήλ.",
    category_kind: "adult",
    display_order: 0,
  },
  {
    name: "Παιδί",
    short_label: "Παιδί",
    category_kind: "child",
    display_order: 1,
  },
] as const;

const EXPENSE_CATEGORIES = [
  { name: "DJ", short_label: "DJ", icon: "🎵", display_order: 0 },
  { name: "Ορχήστρα", short_label: "Ορχ.", icon: "🎻", display_order: 1 },
  { name: "Φωτογράφος", short_label: "Φωτ.", icon: "📸", display_order: 2 },
  { name: "Βιντεολήπτης", short_label: "Βιντ.", icon: "🎥", display_order: 3 },
  { name: "Ενοίκιο χώρου", short_label: "Χώρος", icon: "🏠", display_order: 4 },
  { name: "Catering", short_label: "Catering", icon: "🍽️", display_order: 5 },
  { name: "Διακόσμηση", short_label: "Διακ.", icon: "🎨", display_order: 6 },
  { name: "Άλλο", short_label: "Άλλο", icon: "📋", display_order: 7 },
] as const;

// ============================================================
// seedClub
// ----------------------------------------------------
// Idempotent — όλα τα steps χρησιμοποιούν ON CONFLICT DO
// NOTHING ή existence checks. Καλείται από API route που έχει
// ήδη περάσει super-admin guard (caller ευθύνεται για auth).
//
// Errors: NO catch εδώ — το propagate στον caller (API route)
// που θα τα μεταφράσει σε HTTP response.
// ============================================================
export async function seedClub(clubId: string): Promise<SeedResult> {
  const supabase = getAdminClient();

  // ----------------------------------------------------
  // 1. Roles (6 system roles per club)
  // ----------------------------------------------------
  const rolesPayload = DEFAULT_ROLES.map((r) => ({
    club_id: clubId,
    name: r.name,
    description: r.description,
    is_system: true,
    display_order: r.display_order,
  }));

  const { data: insertedRoles, error: rolesError } = await supabase
    .from("member_roles")
    .upsert(rolesPayload, {
      onConflict: "club_id,name",
      ignoreDuplicates: true,
    })
    .select("id, name");
  if (rolesError) throw rolesError;

  // Re-select για να καλύψουμε και pre-existing rows (στο idempotent
  // re-seed): η upsert με ignoreDuplicates επιστρέφει ΜΟΝΟ τα νέα rows,
  // οπότε δεν φτάνει για να χτίσουμε το πλήρες name→id map.
  const roleNames = DEFAULT_ROLES.map((r) => r.name);
  const { data: allRoles, error: rolesSelectError } = await supabase
    .from("member_roles")
    .select("id, name")
    .eq("club_id", clubId)
    .in("name", roleNames);
  if (rolesSelectError) throw rolesSelectError;

  if (!allRoles || allRoles.length !== DEFAULT_ROLES.length) {
    throw new Error(
      `seedClub: αναμένονταν ${DEFAULT_ROLES.length} roles για club ${clubId}, βρέθηκαν ${allRoles?.length ?? 0}`,
    );
  }

  const nameToId = new Map<string, string>();
  for (const r of allRoles) nameToId.set(r.name, r.id);

  // ----------------------------------------------------
  // 2. Permissions (73 rows total για 6 roles)
  // ----------------------------------------------------
  const permissionRows: PermissionRow[] = [];
  for (const role of DEFAULT_ROLES) {
    const id = nameToId.get(role.name);
    if (!id) {
      throw new Error(`seedClub: role id λείπει για ${role.name}`);
    }
    permissionRows.push(
      ...buildPermissionsForRole(id, role.name as RoleName),
    );
  }

  // Idempotency note: η UNIQUE constraint
  // (role_id, module, action, scope, scope_value) δεν πιάνει null
  // duplicates στην PostgreSQL (scope_value=null για όλα τα seeds).
  // Άρα ένα naive .insert() σε re-seed θα δημιουργούσε διπλά rows.
  // Λύση: skip το step αν υπάρχουν ήδη permissions για τα 6 role ids.
  const roleIds = Array.from(nameToId.values());
  const { count: existingPermsCount, error: permsCheckError } = await supabase
    .from("member_role_permissions")
    .select("*", { count: "exact", head: true })
    .in("role_id", roleIds);
  if (permsCheckError) throw permsCheckError;

  let permissionsInserted = 0;
  if ((existingPermsCount ?? 0) === 0) {
    const { data: insertedPerms, error: permsError } = await supabase
      .from("member_role_permissions")
      .insert(permissionRows)
      .select("id");
    if (permsError) throw permsError;
    permissionsInserted = insertedPerms?.length ?? 0;
  }

  // ----------------------------------------------------
  // 3. Ticket categories (Ενήλικας/adult + Παιδί/child)
  // ----------------------------------------------------
  const ticketsPayload = TICKET_CATEGORIES.map((t) => ({
    club_id: clubId,
    name: t.name,
    short_label: t.short_label,
    category_kind: t.category_kind,
    display_order: t.display_order,
  }));
  const { data: insertedTickets, error: ticketsError } = await supabase
    .from("ticket_categories")
    .upsert(ticketsPayload, {
      onConflict: "club_id,name",
      ignoreDuplicates: true,
    })
    .select("id");
  if (ticketsError) throw ticketsError;

  // ----------------------------------------------------
  // 4. Expense categories (8 defaults)
  // ----------------------------------------------------
  const expensesPayload = EXPENSE_CATEGORIES.map((e) => ({
    club_id: clubId,
    name: e.name,
    short_label: e.short_label,
    icon: e.icon,
    display_order: e.display_order,
  }));
  const { data: insertedExpenses, error: expensesError } = await supabase
    .from("expense_categories")
    .upsert(expensesPayload, {
      onConflict: "club_id,name",
      ignoreDuplicates: true,
    })
    .select("id");
  if (expensesError) throw expensesError;

  // ----------------------------------------------------
  // 5. Club settings (single row per club)
  // ----------------------------------------------------
  // Προϋποθέτει UNIQUE constraint σε club_settings.club_id (one
  // settings row per club). Αν δεν υπάρχει, η upsert θα σκάσει
  // — flag στον caller, όχι σιωπηλό fallback.
  const { data: insertedSettings, error: settingsError } = await supabase
    .from("club_settings")
    .upsert(
      { club_id: clubId },
      { onConflict: "club_id", ignoreDuplicates: true },
    )
    .select("id");
  if (settingsError) throw settingsError;

  return {
    roles: insertedRoles?.length ?? 0,
    permissions: permissionsInserted,
    ticketCategories: insertedTickets?.length ?? 0,
    expenseCategories: insertedExpenses?.length ?? 0,
    clubSettings: (insertedSettings?.length ?? 0) > 0,
  };
}
