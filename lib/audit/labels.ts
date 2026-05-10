// lib/audit/labels.ts
//
// Greek translations για audit log display.
// Καλύπτει field names + actor labels για το members table audit.
// Foundation για future expansion (events, finances, sponsors).

import type { AuditActorLabel } from "@/lib/supabase/types";

// ──────────────────────────────────────────────────────────────────
// Field labels — members table
// ──────────────────────────────────────────────────────────────────

/**
 * Greek labels για member fields που εμφανίζονται στο audit history.
 * Ταιριάζει με τα labels των /me/[token] και /portal/profile forms.
 */
export const MEMBER_FIELD_LABELS: Record<string, string> = {
  phone: "Τηλέφωνο",
  birth_date: "Ημερομηνία γέννησης",
  birthplace: "Τόπος γέννησης",
  residence: "Τόπος κατοικίας",
  address: "Διεύθυνση",
  occupation: "Επάγγελμα",
  father_name: "Όνομα πατέρα",
  mother_name: "Όνομα μητέρας",
  maiden_name: "Πατρικό επώνυμο",
  // Read-only fields — εμφανίζονται αν admin τα αλλάξει (future PR)
  email: "Email",
  first_name: "Όνομα",
  last_name: "Επώνυμο",
  status: "Κατάσταση",
};

/**
 * Helper: επιστρέφει Greek label για ένα field.
 * Fallback στο raw field name αν δεν υπάρχει mapping.
 */
export function getFieldLabel(field: string): string {
  return MEMBER_FIELD_LABELS[field] ?? field;
}

// ──────────────────────────────────────────────────────────────────
// Actor labels
// ──────────────────────────────────────────────────────────────────

/**
 * Greek translations των AuditActorLabel values.
 */
export const ACTOR_LABELS: Record<AuditActorLabel, string> = {
  admin: "Γραμματεία",
  self_via_token: "Από email link",
  self_via_portal: "Από portal",
  system: "Σύστημα",
};

export function getActorLabel(label: AuditActorLabel): string {
  return ACTOR_LABELS[label] ?? label;
}
