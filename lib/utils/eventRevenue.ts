import type {
  Club,
  EventSponsor,
  EventTicketPrice,
  Reservation,
} from "@/lib/supabase/types";
import {
  type AttendeeWithMember,
  resolveIsChild,
} from "@/lib/utils/attendees";

export type AttendeeCategory = "adult" | "child";

export type ReservationRevenue = {
  adultsCount: number;
  adultsTotal: number;
  childrenCount: number;
  childrenTotal: number;
  anonymousAdultsCount: number;
  anonymousAdultsTotal: number;
  grandTotal: number;
};

export type EventRevenue = {
  reservationsRevenue: number;
  sponsorsRevenue: number;
  totalRevenue: number;
  paidRevenue: number;
  pendingRevenue: number;
  reservationsCount: number;
  paidReservationsCount: number;
};

export function formatEuro(amount: number): string {
  return new Intl.NumberFormat("el-GR", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

// Compact currency for inline breakdown: 30 → "30€", 30.5 → "30,50€"
export function formatEuroCompact(amount: number): string {
  const isInteger = amount === Math.floor(amount);
  return new Intl.NumberFormat("el-GR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: isInteger ? 0 : 2,
    maximumFractionDigits: isInteger ? 0 : 2,
  })
    .format(amount)
    .replace(/\s+€/, "€");
}

export function resolveAttendeeCategory(
  attendee: AttendeeWithMember,
  club: Pick<Club, "child_age_threshold">
): AttendeeCategory {
  const { isChild } = resolveIsChild(attendee, club.child_age_threshold);
  return isChild ? "child" : "adult";
}

export function matchTicketPrice(
  category: AttendeeCategory,
  ticketPrices: EventTicketPrice[]
): EventTicketPrice | null {
  if (ticketPrices.length === 0) return null;
  const sorted = [...ticketPrices].sort((a, b) => a.display_order - b.display_order);

  if (category === "child") {
    return sorted.find((p) => /παιδ|child/i.test(p.label)) ?? sorted[0];
  }

  return sorted.find((p) => /ενήλικ|adult/i.test(p.label)) ?? sorted[0];
}

export function calculateReservationRevenue(
  reservation: Reservation,
  attendees: AttendeeWithMember[],
  ticketPrices: EventTicketPrice[],
  club: Pick<Club, "child_age_threshold">
): ReservationRevenue {
  const empty: ReservationRevenue = {
    adultsCount: 0,
    adultsTotal: 0,
    childrenCount: 0,
    childrenTotal: 0,
    anonymousAdultsCount: 0,
    anonymousAdultsTotal: 0,
    grandTotal: 0,
  };

  if (ticketPrices.length === 0) return empty;

  const adultPrice = matchTicketPrice("adult", ticketPrices)?.price ?? 0;
  const childPrice = matchTicketPrice("child", ticketPrices)?.price ?? 0;

  // No attendee records yet — use pax_count as anonymous adults
  if (attendees.length === 0) {
    const count = reservation.pax_count;
    const total = count * adultPrice;
    return { ...empty, anonymousAdultsCount: count, anonymousAdultsTotal: total, grandTotal: total };
  }

  let adultsCount = 0;
  let childrenCount = 0;
  let anonymousAdultsCount = 0;

  for (const attendee of attendees) {
    const category = resolveAttendeeCategory(attendee, club);
    const isAnonymous = !attendee.member_id && !attendee.guest_name;

    if (category === "child") {
      childrenCount++;
    } else if (isAnonymous) {
      anonymousAdultsCount++;
    } else {
      adultsCount++;
    }
  }

  const adultsTotal = adultsCount * adultPrice;
  const childrenTotal = childrenCount * childPrice;
  const anonymousAdultsTotal = anonymousAdultsCount * adultPrice;

  return {
    adultsCount,
    adultsTotal,
    childrenCount,
    childrenTotal,
    anonymousAdultsCount,
    anonymousAdultsTotal,
    grandTotal: adultsTotal + childrenTotal + anonymousAdultsTotal,
  };
}

export function calculateEventRevenue(
  reservations: Reservation[],
  attendeesByReservation: Map<string, AttendeeWithMember[]>,
  ticketPrices: EventTicketPrice[],
  sponsors: EventSponsor[],
  club: Pick<Club, "child_age_threshold">
): EventRevenue {
  let reservationsRevenue = 0;
  let paidRevenue = 0;
  let paidReservationsCount = 0;

  for (const r of reservations) {
    const attendees = attendeesByReservation.get(r.id) ?? [];
    const rev = calculateReservationRevenue(r, attendees, ticketPrices, club);
    reservationsRevenue += rev.grandTotal;
    if (r.is_paid) {
      paidRevenue += rev.grandTotal;
      paidReservationsCount++;
    }
  }

  const sponsorsRevenue = sponsors.reduce((sum, s) => {
    if (s.contribution_type !== "money") return sum;
    if (s.contribution_value == null) return sum;
    return sum + s.contribution_value;
  }, 0);

  const totalRevenue = reservationsRevenue + sponsorsRevenue;

  return {
    reservationsRevenue,
    sponsorsRevenue,
    totalRevenue,
    paidRevenue,
    pendingRevenue: reservationsRevenue - paidRevenue,
    reservationsCount: reservations.length,
    paidReservationsCount,
  };
}

export function formatRevenueBreakdown(
  rev: ReservationRevenue,
  ticketPrices: EventTicketPrice[]
): string {
  const totalCount = rev.adultsCount + rev.childrenCount + rev.anonymousAdultsCount;
  if (totalCount === 0) return "Καμία χρέωση";

  const adultPrice = matchTicketPrice("adult", ticketPrices)?.price ?? 0;
  const childPrice = matchTicketPrice("child", ticketPrices)?.price ?? 0;

  const parts: string[] = [];

  if (rev.adultsCount > 0) {
    parts.push(`${rev.adultsCount} ενήλικες × ${formatEuroCompact(adultPrice)}`);
  }
  if (rev.childrenCount > 0) {
    parts.push(`${rev.childrenCount} παιδιά × ${formatEuroCompact(childPrice)}`);
  }
  if (rev.anonymousAdultsCount > 0) {
    parts.push(`${rev.anonymousAdultsCount} ανώνυμοι × ${formatEuroCompact(adultPrice)}`);
  }

  return parts.join(" + ");
}
