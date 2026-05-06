"use client";

import { useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { errorMessage, getBrowserClient } from "@/lib/supabase/client";
import { useClubSettings } from "@/lib/hooks/useClubSettings";
import { useCurrentClub } from "@/lib/hooks/useCurrentClub";
import type {
  Event as EventRow,
  PresenceStatus,
} from "@/lib/supabase/types";
import {
  RESERVATION_SELECT,
  formatMemberName,
  isPresentLike,
  nextPresenceStatus,
  sortAttendees,
  type AttendeeWithMember,
  type ReservationWithAttendees,
} from "@/lib/utils/attendees";

type TableShape = "round" | "square";
type VenueTable = {
  id: string;
  number: number;
  shape: TableShape;
  capacity: number;
};

function parseVenueConfig(raw: unknown): Map<number, VenueTable> {
  const map = new Map<number, VenueTable>();
  if (!raw || typeof raw !== "object") return map;
  const list = (raw as { tables?: unknown }).tables;
  if (!Array.isArray(list)) return map;
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const v = item as Record<string, unknown>;
    if (
      typeof v.id === "string" &&
      typeof v.number === "number" &&
      (v.shape === "round" || v.shape === "square") &&
      typeof v.capacity === "number"
    ) {
      map.set(v.number, {
        id: v.id,
        number: v.number,
        shape: v.shape,
        capacity: v.capacity,
      });
    }
  }
  return map;
}

export default function EntranceListPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-3xl p-10 text-center text-muted">
          Φόρτωση…
        </div>
      }
    >
      <EntranceListView />
    </Suspense>
  );
}

function EntranceListView() {
  const params = useSearchParams();
  const eventId = params.get("event");
  const { settings: club, clubName } = useClubSettings();
  const { clubId, loading: clubLoading } = useCurrentClub();

  const [event, setEvent] = useState<EventRow | null>(null);
  const [reservations, setReservations] = useState<ReservationWithAttendees[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [optimisticPresence, setOptimisticPresence] = useState<
    Record<
      string,
      { presence_status: PresenceStatus; checked_in_at: string | null }
    >
  >({});
  const refetch = useCallback(async () => {
    if (!eventId || !clubId) return;
    const supabase = getBrowserClient();
    const [evRes, rRes] = await Promise.all([
      supabase
        .from("events")
        .select("*")
        .eq("id", eventId)
        .eq("club_id", clubId)
        .single(),
      supabase
        .from("reservations")
        .select(RESERVATION_SELECT)
        .eq("event_id", eventId)
        .eq("club_id", clubId),
    ]);
    if (evRes.error) throw evRes.error;
    if (rRes.error) throw rRes.error;
    setEvent(evRes.data as EventRow);
    setReservations(
      (rRes.data ?? []) as unknown as ReservationWithAttendees[]
    );
  }, [eventId, clubId]);

  useEffect(() => {
    if (!eventId) {
      setError("Δεν δόθηκε εκδήλωση.");
      setLoading(false);
      return;
    }
    if (clubLoading) return;
    if (!clubId) {
      setError("Δεν έχει εντοπιστεί σύλλογος.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        await refetch();
      } catch (err) {
        if (!cancelled)
          setError(errorMessage(err, "Σφάλμα φόρτωσης λίστας."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId, clubId, clubLoading, refetch]);

  // Realtime: refetch on any reservation or attendee change for this event
  useEffect(() => {
    if (!eventId || !clubId) return;
    const supabase = getBrowserClient();
    const resChan = supabase
      .channel(`entrance:reservations:${eventId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "reservations",
          filter: `event_id=eq.${eventId}`,
        },
        () => {
          void refetch();
        }
      )
      .subscribe();
    const attChan = supabase
      .channel(`entrance:attendees:${eventId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "reservation_attendees",
        },
        () => {
          void refetch();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(resChan);
      supabase.removeChannel(attChan);
    };
  }, [eventId, clubId, refetch]);

  const venueTables = useMemo(
    () => parseVenueConfig(event?.venue_map_config),
    [event]
  );

  const reservationsWithOptimistic = useMemo(() => {
    return reservations.map((r) => ({
      ...r,
      attendees: sortAttendees(
        (r.attendees ?? []).map((a) => {
          const o = optimisticPresence[a.id];
          return o ? { ...a, ...o } : a;
        })
      ),
    }));
  }, [reservations, optimisticPresence]);

  const sortedReservations = useMemo(() => {
    return [...reservationsWithOptimistic].sort((a, b) => {
      const aT = a.table_number ?? Number.MAX_SAFE_INTEGER;
      const bT = b.table_number ?? Number.MAX_SAFE_INTEGER;
      if (aT !== bT) return aT - bT;
      return a.group_name.localeCompare(b.group_name, "el", { sensitivity: "base" });
    });
  }, [reservationsWithOptimistic]);

  const totals = useMemo(() => {
    let present = 0;
    let expected = 0;
    let total = 0;
    for (const r of reservationsWithOptimistic) {
      for (const a of r.attendees) {
        total += 1;
        if (isPresentLike(a.presence_status)) present += 1;
        if (a.presence_status === "expected") expected += 1;
      }
    }
    return { present, expected, total };
  }, [reservationsWithOptimistic]);

  const [lockConfirmOpen, setLockConfirmOpen] = useState(false);
  const [locking, setLocking] = useState(false);

  const handleLockPresence = useCallback(async () => {
    if (totals.expected === 0) return;

    setLocking(true);
    setError(null);
    try {
      // Collect attendee IDs με presence_status === "expected"
      const expectedIds: string[] = [];
      for (const r of reservationsWithOptimistic) {
        for (const a of r.attendees) {
          if (a.presence_status === "expected") {
            expectedIds.push(a.id);
          }
        }
      }

      if (expectedIds.length === 0) {
        setLockConfirmOpen(false);
        return;
      }

      const supabase = getBrowserClient();
      const { error: updateError } = await supabase
        .from("reservation_attendees")
        .update({ presence_status: "no_show" })
        .in("id", expectedIds);

      if (updateError) throw updateError;

      await refetch();
      setLockConfirmOpen(false);
    } catch (err) {
      console.error("Lock presence failed:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Αποτυχία κλειδώματος παρουσιών"
      );
    } finally {
      setLocking(false);
    }
  }, [totals.expected, reservationsWithOptimistic, refetch]);

  async function handleTogglePresence(
    attendeeId: string,
    currentStatus: PresenceStatus
  ) {
    const newStatus = nextPresenceStatus(currentStatus);
    const newCheckedInAt =
      newStatus === "present" ? new Date().toISOString() : null;
    setOptimisticPresence((prev) => ({
      ...prev,
      [attendeeId]: {
        presence_status: newStatus,
        checked_in_at: newCheckedInAt,
      },
    }));
    setError(null);
    try {
      const supabase = getBrowserClient();
      const { error: uErr } = await supabase
        .from("reservation_attendees")
        .update({
          presence_status: newStatus,
          checked_in_at: newCheckedInAt,
        })
        .eq("id", attendeeId);
      if (uErr) throw uErr;
      await refetch();
    } catch (err) {
      setError(errorMessage(err, "Σφάλμα ενημέρωσης παρουσίας."));
    } finally {
      setOptimisticPresence((prev) => {
        const next = { ...prev };
        delete next[attendeeId];
        return next;
      });
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl p-10 text-center text-muted">
        Φόρτωση…
      </div>
    );
  }

  if (error && !event) {
    return (
      <div className="mx-auto max-w-3xl p-10 text-center text-danger">
        {error}
      </div>
    );
  }

  if (!event) {
    return (
      <div className="mx-auto max-w-3xl p-10 text-center text-danger">
        Δεν βρέθηκε η εκδήλωση.
      </div>
    );
  }

  const presentRatio =
    totals.total > 0 ? Math.round((totals.present / totals.total) * 100) : 0;

  return (
    <div className="mx-auto max-w-4xl p-4 print:p-0 sm:p-6">
      {/* Action bar */}
      <div className="mb-4 flex flex-wrap justify-end gap-2 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90"
        >
          🖨 Εκτύπωση
        </button>
        <button
          type="button"
          onClick={() => window.close()}
          className="rounded-lg border border-border px-4 py-2 text-sm transition hover:bg-background"
        >
          Κλείσιμο
        </button>
      </div>

      {error && (
        <div className="mb-3 flex items-start justify-between gap-2 rounded-md border border-danger/30 bg-danger/10 p-2 text-xs text-danger print:hidden">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="shrink-0 rounded px-1 hover:opacity-70"
            aria-label="Κλείσιμο"
          >
            ✕
          </button>
        </div>
      )}

      <article className="rounded-xl border border-border bg-surface p-6 shadow-sm print:border-0 print:p-0 print:shadow-none">
        {/* Header */}
        <header className="mb-5 flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
          <div className="flex items-center gap-3">
            {club.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={club.logo_url}
                alt={clubName}
                className="h-12 w-12 shrink-0 rounded-lg object-cover"
              />
            )}
            <div>
              <p className="text-xs text-muted">{clubName}</p>
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                {event.event_name}
              </h1>
              <p className="mt-0.5 text-xs text-muted">
                Λίστα Εισόδου & Check-in —{" "}
                {new Date(event.event_date).toLocaleDateString("el-GR")}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 print:hidden">
            <button
              type="button"
              onClick={() => setLockConfirmOpen(true)}
              disabled={totals.expected === 0 || locking}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm transition hover:bg-background disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Κλείδωμα παρουσιών"
            >
              <span aria-hidden="true">🔒</span>
              <span>Κλείδωμα</span>
              <span
                className={
                  totals.expected > 0
                    ? "rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-900"
                    : "rounded-full bg-background px-1.5 py-0.5 text-[11px] font-medium text-muted"
                }
              >
                {totals.expected}
              </span>
            </button>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-muted">
              Παρόντες
            </p>
            <p className="text-3xl font-bold tabular-nums text-accent">
              {totals.present}
              <span className="text-muted"> / {totals.total}</span>
            </p>
            <p className="text-[11px] text-muted">{presentRatio}%</p>
          </div>
        </header>

        {sortedReservations.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            Δεν υπάρχουν κρατήσεις.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 print:gap-2">
            {sortedReservations.map((r) => (
              <ReservationCard
                key={r.id}
                reservation={r}
                tableCapacity={
                  r.table_number != null
                    ? venueTables.get(r.table_number)?.capacity ?? null
                    : null
                }
                onTogglePresence={handleTogglePresence}
              />
            ))}
          </div>
        )}
      </article>

      <style jsx global>{`
        @media print {
          body {
            background: white !important;
          }
          aside,
          nav {
            display: none !important;
          }
          main {
            padding: 0 !important;
          }
        }
      `}</style>

      {lockConfirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="lock-confirm-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print:hidden"
          onClick={(e) => {
            if (e.target === e.currentTarget && !locking) {
              setLockConfirmOpen(false);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" && !locking) {
              setLockConfirmOpen(false);
            }
          }}
        >
          <div className="w-full max-w-sm rounded-lg bg-surface p-5 shadow-lg">
            <h2 id="lock-confirm-title" className="text-base font-semibold">
              Κλείδωμα παρουσιών;
            </h2>
            <p className="mt-2 text-sm text-muted">
              {totals.expected}{" "}
              {totals.expected === 1 ? "άτομο που αναμένεται" : "άτομα που αναμένονται"}{" "}
              θα μαρκαριστούν ως «δεν ήρθαν». Μπορείς να αλλάξεις
              χειροκίνητα όποιον χρειαστεί.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setLockConfirmOpen(false)}
                disabled={locking}
                className="rounded-lg border border-border px-3 py-2 text-sm transition hover:bg-background disabled:opacity-50"
              >
                Ακύρωση
              </button>
              <button
                type="button"
                onClick={handleLockPresence}
                disabled={locking}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
              >
                <span aria-hidden="true">🔒</span>
                {locking ? "Κλείδωμα..." : "Κλείδωμα"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReservationCard({
  reservation,
  tableCapacity,
  onTogglePresence,
}: {
  reservation: ReservationWithAttendees;
  tableCapacity: number | null;
  onTogglePresence: (attendeeId: string, currentStatus: PresenceStatus) => void;
}) {
  const presentCount = reservation.attendees.filter((a) =>
    isPresentLike(a.presence_status)
  ).length;
  const totalCount = reservation.attendees.length;
  const overCapacity =
    tableCapacity != null && presentCount > tableCapacity
      ? presentCount - tableCapacity
      : 0;
  const leadAttendee = reservation.attendees.find(
    (a) => a.is_lead && a.member
  );
  const leadName = leadAttendee?.member
    ? formatMemberName(leadAttendee.member)
    : null;

  return (
    <section className="rounded-lg border border-border bg-background p-3 print:break-inside-avoid print:border print:p-2">
      <header className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-accent/10 px-2 py-0.5 text-xs font-semibold text-accent">
            {reservation.table_number != null
              ? `Τραπέζι ${reservation.table_number}`
              : "Χωρίς τραπέζι"}
          </span>
          <h3 className="text-sm font-semibold">{reservation.group_name}</h3>
          {leadName && (
            <span className="text-xs text-muted">⭐ {leadName}</span>
          )}
          {overCapacity > 0 && (
            <span className="rounded-md border border-amber-400 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
              ⚠️ +{overCapacity} από χωρητικότητα
            </span>
          )}
        </div>
        <span className="shrink-0 text-xs tabular-nums text-muted">
          {presentCount} / {totalCount} παρόντες
        </span>
      </header>

      <ul className="flex flex-col gap-1">
        {reservation.attendees.map((a) => (
          <AttendeeCheckinRow
            key={a.id}
            attendee={a}
            onTogglePresence={() => onTogglePresence(a.id, a.presence_status)}
          />
        ))}
      </ul>
    </section>
  );
}

function AttendeeCheckinRow({
  attendee,
  onTogglePresence,
}: {
  attendee: AttendeeWithMember;
  onTogglePresence: () => void;
}) {
  const isMember = !!attendee.member_id && !!attendee.member;
  const isGuest = !attendee.member_id && !!attendee.guest_name;
  const isAbsent = attendee.presence_status === "no_show";

  let name: string;
  let kindIcon: string;
  if (isMember && attendee.member) {
    name = formatMemberName(attendee.member);
    kindIcon = "✅";
  } else if (isGuest) {
    name = attendee.guest_name ?? "";
    kindIcon = "🪪";
  } else {
    name = "Ανώνυμος";
    kindIcon = "👻";
  }

  function handleClick() {
    onTogglePresence();
  }

  return (
    <li
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      aria-pressed={isPresentLike(attendee.presence_status)}
      className={`flex cursor-pointer items-center justify-between gap-2 rounded-md border border-border bg-surface px-2.5 py-2 text-sm transition-all duration-150 hover:bg-background print:cursor-default print:py-1.5 print:hover:bg-transparent ${
        isAbsent ? "opacity-60" : "opacity-100"
      }`}
    >
      <span className="flex min-w-0 items-center gap-2 truncate">
        <span aria-hidden className="hidden print:inline">
          {isPresentLike(attendee.presence_status) ? "✓" : "⏸"}
        </span>
        <span aria-hidden className="print:hidden">
          {kindIcon}
        </span>
        <span
          className={`min-w-0 truncate transition-all duration-150 ${
            isAbsent ? "line-through" : ""
          }`}
        >
          {name}
        </span>
        {attendee.is_lead && (
          <span
            aria-label="Αρχηγός"
            className="shrink-0 text-[11px] text-amber-600 dark:text-amber-400"
          >
            ⭐
          </span>
        )}
      </span>
      {isAbsent && (
        <span className="shrink-0 rounded bg-muted/20 px-1.5 py-0.5 text-[10px] font-medium text-muted print:bg-transparent">
          Δεν ήρθε
        </span>
      )}
    </li>
  );
}

