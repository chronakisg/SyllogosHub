"use client";

import { useEffect, useMemo, useState } from "react";
import { errorMessage, getBrowserClient } from "@/lib/supabase/client";
import { useCurrentClub } from "@/lib/hooks/useCurrentClub";
import type {
  Event as EventRow,
  EventSponsor,
  Sponsor,
} from "@/lib/supabase/types";
import type { TicketPriceWithCategory } from "@/lib/utils/eventRevenue";
import {
  type AttendeeWithMember,
  type ReservationWithAttendees,
  RESERVATION_SELECT,
} from "@/lib/utils/attendees";
import {
  calculateEventRevenue,
  calculateReservationRevenue,
  formatEuro,
  formatRevenueBreakdown,
} from "@/lib/utils/eventRevenue";

// ── Types ────────────────────────────────────────────────────

type SponsorWithMember = Sponsor & {
  member: { first_name: string | null; last_name: string | null } | null;
};


type EventSponsorWithSponsor = EventSponsor & {
  sponsor: SponsorWithMember | null;
};

// ── Helpers ──────────────────────────────────────────────────

const inputClass =
  "rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

function sponsorDisplayName(s: EventSponsorWithSponsor): string {
  if (s.sponsor?.member) {
    const { last_name, first_name } = s.sponsor.member;
    const name = [last_name, first_name].filter(Boolean).join(" ");
    if (name) return name;
  }
  return s.sponsor?.external_name ?? "—";
}

// ── Main component ───────────────────────────────────────────

export default function EventDashboardTab() {
  const { clubId, club, loading: clubLoading } = useCurrentClub();

  const [events, setEvents] = useState<EventRow[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const [reservations, setReservations] = useState<ReservationWithAttendees[]>([]);
  const [ticketPrices, setTicketPrices] = useState<TicketPriceWithCategory[]>([]);
  const [eventSponsors, setEventSponsors] = useState<EventSponsorWithSponsor[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [sponsorsError, setSponsorsError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Load events list
  useEffect(() => {
    if (clubLoading || !clubId) return;
    let cancelled = false;
    setEventsLoading(true);
    (async () => {
      try {
        const supabase = getBrowserClient();
        const { data, error: qErr } = await supabase
          .from("events")
          .select("*")
          .eq("club_id", clubId)
          .order("event_date", { ascending: false });
        if (cancelled) return;
        if (qErr) throw qErr;
        const list = (data ?? []) as EventRow[];
        setEvents(list);
        setSelectedEventId((prev) => prev ?? list[0]?.id ?? null);
      } catch (err) {
        if (!cancelled) setEventsError(errorMessage(err, "Σφάλμα φόρτωσης εκδηλώσεων."));
      } finally {
        if (!cancelled) setEventsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [clubId, clubLoading]);

  // Load event data in parallel
  useEffect(() => {
    if (!selectedEventId || !clubId) {
      setReservations([]);
      setTicketPrices([]);
      setEventSponsors([]);
      setSponsorsError(null);
      return;
    }
    let cancelled = false;
    setDataLoading(true);
    setDataError(null);
    (async () => {
      try {
        const supabase = getBrowserClient();
        const [resRes, pricesRes, sponsorsRes] = await Promise.all([
          supabase
            .from("reservations")
            .select(RESERVATION_SELECT)
            .eq("event_id", selectedEventId)
            .eq("club_id", clubId)
            .order("group_name", { ascending: true }),
          supabase
            .from("event_ticket_prices")
            .select("*, category:category_id(id, name, category_kind)")
            .eq("event_id", selectedEventId)
            .order("display_order", { ascending: true }),
          supabase
            .from("event_sponsors")
            .select("*, sponsor:sponsor_id(*, member:member_id(first_name, last_name))")
            .eq("event_id", selectedEventId),
        ]);
        if (cancelled) return;
        if (resRes.error) throw resRes.error;
        if (pricesRes.error) throw pricesRes.error;
        setReservations((resRes.data ?? []) as unknown as ReservationWithAttendees[]);
        setTicketPrices((pricesRes.data ?? []) as unknown as TicketPriceWithCategory[]);
        if (sponsorsRes.error) {
          setSponsorsError(errorMessage(sponsorsRes.error, "Σφάλμα φόρτωσης χορηγιών."));
          setEventSponsors([]);
        } else {
          setSponsorsError(null);
          setEventSponsors((sponsorsRes.data ?? []) as unknown as EventSponsorWithSponsor[]);
        }
      } catch (err) {
        if (!cancelled) setDataError(errorMessage(err, "Σφάλμα φόρτωσης δεδομένων εκδήλωσης."));
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedEventId, clubId]);

  // Toggle is_paid — optimistic update
  async function togglePaid(r: ReservationWithAttendees) {
    if (!clubId) return;
    const next = !r.is_paid;
    setUpdatingId(r.id);
    setReservations((prev) =>
      prev.map((x) => (x.id === r.id ? { ...x, is_paid: next } : x))
    );
    try {
      const supabase = getBrowserClient();
      const { error: uErr } = await supabase
        .from("reservations")
        .update({ is_paid: next })
        .eq("id", r.id)
        .eq("club_id", clubId);
      if (uErr) throw uErr;
    } catch (err) {
      setReservations((prev) =>
        prev.map((x) => (x.id === r.id ? { ...x, is_paid: r.is_paid } : x))
      );
      setDataError(errorMessage(err, "Σφάλμα ενημέρωσης κατάστασης."));
    } finally {
      setUpdatingId(null);
    }
  }

  // ── Derived state ──────────────────────────────────────────

  const attendeesByReservation = useMemo(() => {
    const map = new Map<string, AttendeeWithMember[]>();
    for (const r of reservations) map.set(r.id, r.attendees ?? []);
    return map;
  }, [reservations]);

  const eventRevenue = useMemo(() => {
    if (!club) return null;
    return calculateEventRevenue(
      reservations,
      attendeesByReservation,
      ticketPrices,
      eventSponsors,
      club
    );
  }, [reservations, attendeesByReservation, ticketPrices, eventSponsors, club]);

  const reservationRevenues = useMemo(() => {
    const map = new Map<string, ReturnType<typeof calculateReservationRevenue>>();
    if (!club) return map;
    for (const r of reservations) {
      map.set(r.id, calculateReservationRevenue(
        r,
        attendeesByReservation.get(r.id) ?? [],
        ticketPrices,
        club
      ));
    }
    return map;
  }, [reservations, attendeesByReservation, ticketPrices, club]);

  const totalPax = useMemo(
    () => reservations.reduce((s, r) => s + r.pax_count, 0),
    [reservations]
  );

  const attendeeTotals = useMemo(() => {
    let totalAdults = 0;
    let totalChildren = 0;
    for (const rev of reservationRevenues.values()) {
      totalAdults += rev.adultsCount + rev.anonymousAdultsCount;
      totalChildren += rev.childrenCount;
    }
    return { totalAdults, totalChildren };
  }, [reservationRevenues]);

  const moneySponsorsSorted = useMemo(
    () => eventSponsors.filter(
      (s) => s.contribution_type === "money" && s.contribution_value != null
    ),
    [eventSponsors]
  );

  const hasTicketPrices = ticketPrices.length > 0;

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Event selector */}
      <div>
        <span className="mb-1 block text-xs font-medium text-muted">Εκδήλωση</span>
        <select
          value={selectedEventId ?? ""}
          onChange={(e) => setSelectedEventId(e.target.value || null)}
          disabled={eventsLoading || events.length === 0}
          className={inputClass + " w-full sm:w-auto sm:min-w-[280px] disabled:opacity-60"}
        >
          {events.length === 0 ? (
            <option value="">— Καμία εκδήλωση —</option>
          ) : (
            events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.event_name} — {new Date(ev.event_date).toLocaleDateString("el-GR")}
              </option>
            ))
          )}
        </select>
      </div>

      {eventsError && (
        <ErrorBanner message={eventsError} onDismiss={() => setEventsError(null)} />
      )}
      {dataError && (
        <ErrorBanner message={dataError} onDismiss={() => setDataError(null)} />
      )}

      {selectedEventId && (
        <>
          {/* No ticket prices warning */}
          {!dataLoading && !hasTicketPrices && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-700 dark:text-amber-300">
              <span>⚠️</span>
              <span>
                Δεν έχουν οριστεί τιμές προσκλήσεων για αυτή την εκδήλωση. Τα ποσά
                δεν μπορούν να υπολογιστούν μέχρι να οριστούν τιμές στην εκδήλωση.
              </span>
            </div>
          )}

          {/* ── 👥 ΣΥΜΜΕΤΟΧΗ ──────────────────────────────── */}
          {!dataLoading && (
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
                👥 Συμμετοχή
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatPill
                  label="Παρέες"
                  value={String(eventRevenue?.reservationsCount ?? reservations.length)}
                  subtext={eventRevenue ? `(${eventRevenue.paidReservationsCount} πληρ.)` : undefined}
                />
                <StatPill label="Άτομα" value={String(totalPax)} />
                <StatPill
                  label="Ενήλικες"
                  value={hasTicketPrices ? String(attendeeTotals.totalAdults) : "—"}
                />
                <StatPill
                  label="Παιδιά"
                  value={hasTicketPrices ? String(attendeeTotals.totalChildren) : "—"}
                />
              </div>
            </section>
          )}

          {/* ── 💰 ΟΙΚΟΝΟΜΙΚΑ ─────────────────────────────── */}
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
              💰 Οικονομικά
            </h2>
            {dataLoading ? (
              <div className="grid gap-3 md:grid-cols-3">
                <div className="h-32 animate-pulse rounded-xl border border-border bg-surface" />
                <div className="h-32 animate-pulse rounded-xl border border-border bg-surface" />
                <div className="h-32 animate-pulse rounded-xl border border-border bg-surface" />
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-3">
                <MoneyCard
                  icon="💰"
                  title="Έσοδα"
                  total={eventRevenue?.totalRevenue ?? 0}
                  paid={eventRevenue?.paidRevenue ?? 0}
                  pending={eventRevenue?.pendingRevenue ?? 0}
                  paidLabel="Εισπράχθηκαν"
                  pendingLabel="Εκκρεμή"
                  paidPercent={
                    eventRevenue && eventRevenue.totalRevenue > 0
                      ? Math.round((eventRevenue.paidRevenue / eventRevenue.totalRevenue) * 100)
                      : null
                  }
                />
                {/* TODO Phase 2 — expenses data */}
                <MoneyCard
                  icon="💸"
                  title="Έξοδα"
                  total={0}
                  paid={0}
                  pending={0}
                  paidLabel="Πληρώθηκαν"
                  pendingLabel="Εκκρεμή"
                  paidPercent={null}
                  placeholder
                />
                <SummaryCard
                  paidRevenue={eventRevenue?.paidRevenue ?? 0}
                  pendingRevenue={eventRevenue?.pendingRevenue ?? 0}
                  totalRevenue={eventRevenue?.totalRevenue ?? 0}
                />
              </div>
            )}
          </section>

          {/* ── ΛΕΠΤΟΜΕΡΕΙΕΣ ΑΝΑ ΠΑΡΕΑ ───────────────────── */}
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
              📋 Λεπτομέρειες ανά Παρέα
            </h2>
            <div className="overflow-hidden rounded-xl border border-border bg-surface">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border bg-background/50 text-xs uppercase tracking-wider text-muted">
                    <tr>
                      <th className="px-4 py-3">Παρέα</th>
                      <th className="px-4 py-3">Άτομα</th>
                      <th className="px-4 py-3">Τραπέζι</th>
                      <th className="px-4 py-3">Ανάλυση</th>
                      <th className="px-4 py-3 text-right">Σύνολο</th>
                      <th className="px-4 py-3 text-right">Πληρωμή</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {dataLoading ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-muted">
                          Φόρτωση…
                        </td>
                      </tr>
                    ) : reservations.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center">
                          <p className="text-2xl">📋</p>
                          <p className="mt-2 text-sm text-muted">
                            Δεν υπάρχουν κρατήσεις για αυτή την εκδήλωση.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      reservations.map((r) => {
                        const rev = reservationRevenues.get(r.id);
                        return (
                          <tr key={r.id} className="hover:bg-background/40">
                            <td className="px-4 py-3 font-medium">{r.group_name}</td>
                            <td className="px-4 py-3 text-muted">{r.pax_count}</td>
                            <td className="px-4 py-3 text-muted">
                              {r.table_number != null ? `Νο ${r.table_number}` : "—"}
                            </td>
                            <td className="px-4 py-3 text-xs text-muted">
                              {rev && hasTicketPrices
                                ? formatRevenueBreakdown(rev, ticketPrices)
                                : "—"}
                            </td>
                            <td className="px-4 py-3 text-right font-medium tabular-nums">
                              {rev && hasTicketPrices ? formatEuro(rev.grandTotal) : "—"}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                onClick={() => togglePaid(r)}
                                disabled={updatingId === r.id}
                                className={
                                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition disabled:opacity-50 " +
                                  (r.is_paid
                                    ? "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400"
                                    : "bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 dark:text-amber-400")
                                }
                              >
                                <span
                                  className={
                                    "h-1.5 w-1.5 rounded-full " +
                                    (r.is_paid ? "bg-emerald-500" : "bg-amber-500")
                                  }
                                />
                                {r.is_paid ? "Πληρωμένη" : "Εκκρεμεί"}
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Sponsors load error */}
          {sponsorsError && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-700 dark:text-amber-300">
              <span>⚠️</span>
              <span>Δεν φορτώθηκαν οι χορηγίες — τα έσοδα ίσως είναι ελλιπή.</span>
            </div>
          )}

          {/* ── ΧΟΡΗΓΟΙ (money only) ──────────────────────── */}
          {!dataLoading && moneySponsorsSorted.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
                🤝 Χορηγοί
              </h2>
              <div className="overflow-hidden rounded-xl border border-border bg-surface">
                <ul className="divide-y divide-border text-sm">
                  {moneySponsorsSorted.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between px-4 py-3"
                    >
                      <span className="font-medium">{sponsorDisplayName(s)}</span>
                      <span className="tabular-nums text-emerald-600 dark:text-emerald-400">
                        {formatEuro(s.contribution_value!)}
                      </span>
                    </li>
                  ))}
                  {moneySponsorsSorted.length >= 1 && (
                    <li className="flex items-center justify-between bg-background/40 px-4 py-2.5 text-sm font-semibold">
                      <span>Σύνολο χορηγιών</span>
                      <span className="tabular-nums">
                        {formatEuro(eventRevenue?.sponsorsRevenue ?? 0)}
                      </span>
                    </li>
                  )}
                </ul>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

// ── Local sub-components ─────────────────────────────────────

function StatPill({ label, value, subtext }: { label: string; value: string; subtext?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold leading-snug tracking-tight">{value}</p>
      {subtext && <p className="text-xs text-muted">{subtext}</p>}
    </div>
  );
}

function MoneyCard({
  icon,
  title,
  total,
  paid,
  pending,
  paidLabel,
  pendingLabel,
  paidPercent,
  placeholder = false,
}: {
  icon: string;
  title: string;
  total: number;
  paid: number;
  pending: number;
  paidLabel: string;
  pendingLabel: string;
  paidPercent: number | null;
  placeholder?: boolean;
}) {
  return (
    <div className={
      "flex h-full flex-col rounded-xl border p-4 " +
      (placeholder ? "border-border/40 bg-surface/40" : "border-border bg-surface")
    }>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
        {icon} {title}
      </p>
      {placeholder ? (
        <div className="space-y-1.5 text-muted/60">
          <p className="text-xl font-semibold">—</p>
          <p className="text-sm italic">Phase 2 — διαχείριση εξόδων στο επόμενο update</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xl font-semibold tabular-nums">{formatEuro(total)}</p>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">✅ {paidLabel}</span>
            <span className="tabular-nums text-emerald-600 dark:text-emerald-400">
              {formatEuro(paid)}
              {paidPercent !== null && (
                <span className="ml-1 text-xs text-muted">({paidPercent}%)</span>
              )}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">⚠️ {pendingLabel}</span>
            <span className={
              "tabular-nums " +
              (pending > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted")
            }>
              {formatEuro(pending)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  paidRevenue,
  pendingRevenue,
  totalRevenue,
}: {
  paidRevenue: number;
  pendingRevenue: number;
  totalRevenue: number;
}) {
  // TODO Phase 2 — expenses
  const expensesPaid = 0;
  const expensesPending = 0;
  const now = paidRevenue - expensesPaid;
  const final = totalRevenue - (expensesPaid + expensesPending);
  return (
    <div className="flex h-full flex-col rounded-xl border border-border bg-surface p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
        📊 Σύνολο
      </p>
      <div className="flex flex-1 flex-col justify-between">
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">Τώρα</span>
            <span className="tabular-nums font-medium">{formatEuro(now)}</span>
          </div>
          <div className="flex justify-between text-muted/80">
            <span>+ Εκκρεμή έσοδα</span>
            <span className="tabular-nums">+{formatEuro(pendingRevenue)}</span>
          </div>
          <div className="flex justify-between text-muted/80">
            <span>− Εκκρεμή έξοδα</span>
            <span className="tabular-nums">−{formatEuro(expensesPending)}</span>
          </div>
        </div>
        <div className="mt-3 border-t border-border pt-3">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted">Τελικό</span>
            <span className="text-xl font-semibold tabular-nums">{formatEuro(final)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ErrorBanner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
      <span>{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 rounded px-2 text-xs hover:opacity-70"
      >
        ✕
      </button>
    </div>
  );
}
