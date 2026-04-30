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
