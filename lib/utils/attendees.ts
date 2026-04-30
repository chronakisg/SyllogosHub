import type {
  Member,
  Reservation,
  ReservationAttendee,
} from "@/lib/supabase/types";

export type AttendeeMemberSummary = Pick<
  Member,
  "id" | "first_name" | "last_name" | "birth_date" | "family_id" | "family_role"
>;

export type AttendeeWithMember = ReservationAttendee & {
  member: AttendeeMemberSummary | null;
};

export type ReservationWithAttendees = Reservation & {
  attendees: AttendeeWithMember[];
};

export const RESERVATION_SELECT = `
  *,
  attendees:reservation_attendees(
    id,
    reservation_id,
    club_id,
    member_id,
    guest_name,
    is_lead,
    notes,
    created_at,
    updated_at,
    member:member_id (
      id,
      first_name,
      last_name,
      birth_date,
      family_id,
      family_role
    )
  )
`;

export function getAttendeeCount(r: ReservationWithAttendees): number {
  if (r.attendees && r.attendees.length > 0) return r.attendees.length;
  return r.pax_count;
}

export function hasAnonymousAttendees(r: ReservationWithAttendees): boolean {
  if (!r.attendees) return false;
  return r.attendees.some((a) => !a.member_id && !a.guest_name);
}

export function sortAttendees(
  attendees: AttendeeWithMember[]
): AttendeeWithMember[] {
  return [...attendees].sort((a, b) => {
    if (a.is_lead && !b.is_lead) return -1;
    if (!a.is_lead && b.is_lead) return 1;

    const bucketA = a.member_id ? 0 : a.guest_name ? 1 : 2;
    const bucketB = b.member_id ? 0 : b.guest_name ? 1 : 2;
    if (bucketA !== bucketB) return bucketA - bucketB;

    if (bucketA === 0) {
      const lastA = a.member?.last_name ?? "";
      const lastB = b.member?.last_name ?? "";
      const lastCmp = lastA.localeCompare(lastB, "el");
      if (lastCmp !== 0) return lastCmp;
      const firstA = a.member?.first_name ?? "";
      const firstB = b.member?.first_name ?? "";
      return firstA.localeCompare(firstB, "el");
    } else if (bucketA === 1) {
      return (a.guest_name ?? "").localeCompare(b.guest_name ?? "", "el");
    } else {
      return (a.created_at ?? "").localeCompare(b.created_at ?? "");
    }
  });
}

export function getAge(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const beforeBirthday =
    now.getMonth() < d.getMonth() ||
    (now.getMonth() === d.getMonth() && now.getDate() < d.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}
