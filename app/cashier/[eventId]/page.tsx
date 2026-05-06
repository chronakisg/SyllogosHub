"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { useRole } from "@/lib/hooks/useRole";
import { useCurrentClub } from "@/lib/hooks/useCurrentClub";
import { AccessDenied } from "@/lib/auth/AccessDenied";
import {
  RESERVATION_SELECT,
  formatMemberName,
  sortAttendees,
  type ReservationWithAttendees,
} from "@/lib/utils/attendees";
import {
  resolveAttendeeCategory,
  matchTicketPrice,
  formatEuroCompact,
  type TicketPriceWithCategory,
} from "@/lib/utils/eventRevenue";
import type { Club } from "@/lib/supabase/types";

type EventSummary = {
  id: string;
  event_name: string;
  event_date: string;
};

type ReservationStatus = "pending" | "partial" | "complete";

type ReservationRow = ReservationWithAttendees & {
  status: ReservationStatus;
  totalPrice: number;
  paidPrice: number;
  paidCount: number;
  presentCount: number;
  adultCount: number;
  childCount: number;
};

export default function CashierPage() {
  const params = useParams<{ eventId: string }>();
  const eventId = params?.eventId;
  const role = useRole();
  const currentClub = useCurrentClub();

  const [event, setEvent] = useState<EventSummary | null>(null);
  const [reservations, setReservations] = useState<ReservationWithAttendees[]>([]);
  const [ticketPrices, setTicketPrices] = useState<TicketPriceWithCategory[]>([]);
  const [club, setClub] = useState<Club | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Open-party modal state
  const [expandedReservationId, setExpandedReservationId] = useState<string | null>(null);
  const [selectedAttendeeIds, setSelectedAttendeeIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!eventId || !currentClub.club?.id) return;
    let cancelled = false;

    async function loadAll() {
      setLoading(true);
      setError(null);
      try {
        const supabase = getBrowserClient();
        const clubId = currentClub.club!.id;

        const [eventRes, reservationsRes, ticketPricesRes, clubRes] =
          await Promise.all([
            supabase
              .from("events")
              .select("id, event_name, event_date")
              .eq("id", eventId)
              .eq("club_id", clubId)
              .maybeSingle(),
            supabase
              .from("reservations")
              .select(RESERVATION_SELECT)
              .eq("event_id", eventId)
              .eq("club_id", clubId),
            supabase
              .from("event_ticket_prices")
              .select("*, category:ticket_categories(id, name, category_kind)")
              .eq("event_id", eventId)
              .order("display_order", { ascending: true }),
            supabase
              .from("clubs")
              .select("*")
              .eq("id", clubId)
              .maybeSingle(),
          ]);

        if (cancelled) return;
        if (eventRes.error) throw eventRes.error;
        if (reservationsRes.error) throw reservationsRes.error;
        if (ticketPricesRes.error) throw ticketPricesRes.error;
        if (clubRes.error) throw clubRes.error;

        if (!eventRes.data) {
          setError("Δεν βρέθηκε η εκδήλωση.");
          return;
        }

        setEvent(eventRes.data as EventSummary);
        setReservations(
          (reservationsRes.data ?? []) as unknown as ReservationWithAttendees[]
        );
        setTicketPrices(
          (ticketPricesRes.data ?? []) as unknown as TicketPriceWithCategory[]
        );
        setClub((clubRes.data ?? null) as Club | null);
      } catch (err) {
        if (cancelled) return;
        console.error("Cashier data fetch failed:", err);
        setError(
          err instanceof Error
            ? err.message
            : "Αποτυχία φόρτωσης δεδομένων"
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadAll();
    return () => {
      cancelled = true;
    };
  }, [eventId, currentClub.club?.id]);

  // Esc key closes the open-party modal
  useEffect(() => {
    if (!expandedReservationId) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setExpandedReservationId(null);
      }
    }

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [expandedReservationId]);

  // Compute reservations με status + pricing — memoized για performance
  const reservationRows: ReservationRow[] = useMemo(() => {
    if (!club) return [];

    const rows = reservations.map((r) => {
      const attendees = r.attendees ?? [];

      let totalPrice = 0;
      let paidPrice = 0;
      let paidCount = 0;
      let presentCount = 0;
      let adultCount = 0;
      let childCount = 0;

      for (const a of attendees) {
        const category = resolveAttendeeCategory(a, club);
        const priceMatch = matchTicketPrice(category, ticketPrices);
        const price = priceMatch?.price ?? 0;

        totalPrice += price;
        if (a.paid_at) {
          paidPrice += a.paid_amount ?? price;
          paidCount += 1;
        }
        if (a.presence_status === "present") {
          presentCount += 1;
        }
        if (category === "child") {
          childCount += 1;
        } else {
          adultCount += 1;
        }
      }

      let status: ReservationStatus;
      if (paidCount === 0) {
        status = "pending";
      } else if (paidCount < attendees.length) {
        status = "partial";
      } else {
        status = "complete";
      }

      return {
        ...r,
        status,
        totalPrice,
        paidPrice,
        paidCount,
        presentCount,
        adultCount,
        childCount,
      };
    });

    return rows;
  }, [reservations, ticketPrices, club]);

  // Sort + filter με search
  const visibleRows: ReservationRow[] = useMemo(() => {
    const statusOrder: Record<ReservationStatus, number> = {
      pending: 0,
      partial: 1,
      complete: 2,
    };

    const filtered = search.trim()
      ? reservationRows.filter((r) =>
          r.group_name.toLowerCase().includes(search.toLowerCase().trim())
        )
      : reservationRows;

    return [...filtered].sort((a, b) => {
      const statusDiff = statusOrder[a.status] - statusOrder[b.status];
      if (statusDiff !== 0) return statusDiff;
      return a.group_name.localeCompare(b.group_name, "el", {
        sensitivity: "base",
      });
    });
  }, [reservationRows, search]);

  // KPIs για το header
  const totals = useMemo(() => {
    let totalAttendees = 0;
    let paidAttendees = 0;
    let presentAttendees = 0;

    for (const r of reservationRows) {
      totalAttendees += r.attendees.length;
      paidAttendees += r.paidCount;
      presentAttendees += r.presentCount;
    }

    return { totalAttendees, paidAttendees, presentAttendees };
  }, [reservationRows]);

  // Currently expanded reservation με computed attendee rows
  const expandedData = useMemo(() => {
    if (!expandedReservationId || !club) return null;

    const row = reservationRows.find((r) => r.id === expandedReservationId);
    if (!row) return null;

    const sortedAttendees = sortAttendees(row.attendees);

    const namedAttendees = sortedAttendees
      .filter((a) => a.member_id !== null || a.guest_name !== null)
      .map((a) => {
        const category = resolveAttendeeCategory(a, club);
        const priceMatch = matchTicketPrice(category, ticketPrices);
        const price = priceMatch?.price ?? 0;
        return {
          attendee: a,
          category,
          price,
          isPaid: a.paid_at !== null,
        };
      });

    const anonymousAttendees = sortedAttendees.filter(
      (a) => a.member_id === null && a.guest_name === null
    );

    return {
      row,
      namedAttendees,
      anonymousAttendees,
    };
  }, [expandedReservationId, reservationRows, club, ticketPrices]);

  // Loading guard
  if (role.loading || currentClub.loading) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <p className="py-8 text-center text-sm text-muted">Φόρτωση…</p>
      </div>
    );
  }

  // Permission guard
  const allowed =
    role.permissions.includes("cashier") ||
    role.permissions.includes("finances") ||
    role.isPresident ||
    role.isSystemAdmin;

  if (role.userId && !allowed) {
    return <AccessDenied />;
  }

  // Missing eventId guard
  if (!eventId) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <p className="py-8 text-center text-sm text-muted">
          Λείπει η εκδήλωση.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <header className="sticky top-0 z-10 -mx-6 mb-4 border-b border-border bg-background px-6 py-3 lg:-mx-10 lg:px-10">
        <div className="mb-2 flex items-center gap-2">
          <Link
            href="/"
            className="text-sm text-muted transition hover:text-foreground"
            aria-label="Επιστροφή"
          >
            ← Πίσω
          </Link>
          <span className="flex-1 truncate text-sm font-semibold">
            💰 Ταμείο · {event?.event_name ?? "…"}
          </span>
        </div>
        {!loading && event && totals.totalAttendees > 0 && (
          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span>
              <strong className="text-foreground">
                {totals.paidAttendees} / {totals.totalAttendees}
              </strong>{" "}
              πληρωμένοι
            </span>
            <span aria-hidden="true">·</span>
            <span>
              <strong className="text-foreground">
                {totals.presentAttendees} / {totals.totalAttendees}
              </strong>{" "}
              παρόντες
            </span>
          </div>
        )}
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Αναζήτηση παρέας…"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
      </header>

      {error && (
        <div className="mb-4 rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      {loading ? (
        <p className="py-8 text-center text-sm text-muted">Φόρτωση…</p>
      ) : !event ? (
        <p className="py-8 text-center text-sm text-muted">
          Δεν βρέθηκε η εκδήλωση.
        </p>
      ) : reservationRows.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-6 text-center">
          <p className="text-sm text-muted">
            Δεν υπάρχουν κρατήσεις σε αυτή την εκδήλωση.
          </p>
        </div>
      ) : visibleRows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">
          Καμία παρέα δεν ταιριάζει με την αναζήτηση.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visibleRows.map((r) => (
            <ReservationCard
              key={r.id}
              row={r}
              onOpen={() => {
                setExpandedReservationId(r.id);
                setSelectedAttendeeIds(new Set());
              }}
            />
          ))}
        </ul>
      )}

      {expandedData && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
          role="dialog"
          aria-modal="true"
          onClick={() => setExpandedReservationId(null)}
        >
          <div
            className="flex h-[90vh] w-full max-w-lg flex-col rounded-t-xl border border-border bg-surface shadow-xl sm:h-auto sm:max-h-[85vh] sm:rounded-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-border bg-surface px-4 py-3">
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-base font-semibold">
                  {expandedData.row.attendees.find((a) => a.is_lead)?.member
                    ? formatMemberName(
                        expandedData.row.attendees.find((a) => a.is_lead)!
                          .member
                      )
                    : expandedData.row.group_name}
                </h2>
                <p className="mt-0.5 text-xs text-muted">
                  {expandedData.row.attendees.length} άτομα
                  {expandedData.row.table_number != null && (
                    <>
                      {" · Νο "}
                      {expandedData.row.table_number}
                    </>
                  )}
                  {" · "}
                  {expandedData.row.paidCount}/
                  {expandedData.row.attendees.length} πληρωμένοι
                </p>
              </div>
              <button
                type="button"
                onClick={() => setExpandedReservationId(null)}
                className="rounded-md px-2 py-1 text-lg leading-none text-muted transition hover:bg-foreground/5 hover:text-foreground"
                aria-label="Κλείσιμο"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3">
              {expandedData.namedAttendees.length > 0 && (
                <>
                  <p className="mb-2 text-[10px] uppercase tracking-wide text-muted">
                    Ονομασμένοι ({expandedData.namedAttendees.length})
                  </p>
                  <ul className="flex flex-col gap-0.5">
                    {expandedData.namedAttendees.map(
                      ({ attendee, category, price, isPaid }) => {
                        const checked = selectedAttendeeIds.has(attendee.id);
                        const name = attendee.member
                          ? formatMemberName(attendee.member)
                          : (attendee.guest_name ?? "");
                        return (
                          <li
                            key={attendee.id}
                            className={
                              "flex items-center gap-3 rounded-md px-2 py-2 " +
                              (isPaid
                                ? "opacity-60"
                                : "transition hover:bg-foreground/5")
                            }
                          >
                            <input
                              type="checkbox"
                              checked={checked || isPaid}
                              disabled={isPaid}
                              onChange={(e) => {
                                setSelectedAttendeeIds((prev) => {
                                  const next = new Set(prev);
                                  if (e.target.checked) next.add(attendee.id);
                                  else next.delete(attendee.id);
                                  return next;
                                });
                              }}
                              className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--brand-primary)] disabled:cursor-not-allowed"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 text-sm">
                                {attendee.is_lead && (
                                  <span aria-hidden="true">⭐</span>
                                )}
                                <span className="truncate font-medium">
                                  {name}
                                </span>
                                {category === "child" && (
                                  <span aria-hidden="true" className="text-xs">
                                    👶
                                  </span>
                                )}
                              </div>
                              <div className="mt-0.5 text-[11px] text-muted">
                                {isPaid ? (
                                  <span className="text-emerald-700">
                                    ✅ Πληρωμένο
                                  </span>
                                ) : attendee.presence_status === "present" ? (
                                  <span className="text-amber-700">
                                    📍 Παρών χωρίς πληρωμή
                                  </span>
                                ) : (
                                  <span>⏳ Αναμένεται</span>
                                )}
                              </div>
                            </div>
                            <span className="text-sm font-medium tabular-nums">
                              {formatEuroCompact(price)}
                            </span>
                          </li>
                        );
                      }
                    )}
                  </ul>
                </>
              )}

              {expandedData.anonymousAttendees.length > 0 && (
                <p className="mt-4 rounded-md border border-dashed border-border bg-background px-3 py-2 text-[11px] text-muted">
                  + {expandedData.anonymousAttendees.length} ανώνυμοι (έρχονται
                  στο επόμενο commit)
                </p>
              )}

              {expandedData.namedAttendees.length === 0 &&
                expandedData.anonymousAttendees.length === 0 && (
                  <p className="py-8 text-center text-sm text-muted">
                    Δεν υπάρχουν attendees σε αυτή την παρέα.
                  </p>
                )}
            </div>

            <div className="sticky bottom-0 border-t border-border bg-surface px-4 py-3">
              <p className="text-center text-[11px] text-muted">
                (Sticky footer με payment button έρχεται στο commit 5)
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReservationCard({
  row,
  onOpen,
}: {
  row: ReservationRow;
  onOpen: () => void;
}) {
  const lead = row.attendees.find((a) => a.is_lead);
  const leadName = lead?.member ? formatMemberName(lead.member) : null;

  const statusStyles: Record<ReservationStatus, string> = {
    pending: "bg-amber-100 text-amber-900",
    partial: "bg-orange-100 text-orange-900",
    complete: "bg-emerald-100 text-emerald-900",
  };

  const statusIcon: Record<ReservationStatus, string> = {
    pending: "⚠️",
    partial: "🟡",
    complete: "✅",
  };

  const statusText =
    row.status === "pending"
      ? formatEuroCompact(row.totalPrice)
      : row.status === "partial"
        ? `${formatEuroCompact(row.paidPrice)} / ${formatEuroCompact(row.totalPrice)}`
        : formatEuroCompact(row.totalPrice);

  return (
    <li className="rounded-lg border border-border bg-surface px-3 py-2.5">
      <div className="flex items-start gap-2">
        {lead && (
          <span aria-hidden="true" className="text-sm leading-tight">
            ⭐
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">
            {leadName ?? row.group_name}
          </div>
          <div className="mt-0.5 text-[11px] text-muted">
            {row.attendees.length} άτομα
            {row.table_number != null && (
              <>
                {" · Νο "}
                {row.table_number}
              </>
            )}
            {" · "}
            <span aria-hidden="true">🧑</span> {row.adultCount}
            {row.childCount > 0 && (
              <>
                {" · "}
                <span aria-hidden="true">👶</span> {row.childCount}
              </>
            )}
          </div>
        </div>
        <span
          className={
            "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium " +
            statusStyles[row.status]
          }
        >
          <span aria-hidden="true">{statusIcon[row.status]}</span>
          {statusText}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted">
          {row.paidCount}/{row.attendees.length} πληρ. ·{" "}
          {row.presentCount}/{row.attendees.length} παρ.
        </span>
        <button
          type="button"
          onClick={onOpen}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-accent/60 hover:bg-foreground/5"
          aria-label="Άνοιξε παρέα"
        >
          🎯 Άνοιξε παρέα
        </button>
      </div>
    </li>
  );
}
