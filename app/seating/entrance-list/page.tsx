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
import type { Event as EventRow } from "@/lib/supabase/types";
import {
  RESERVATION_SELECT,
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
    Record<string, { is_present: boolean; checked_in_at: string | null }>
  >({});
  const [confirmCleanupOpen, setConfirmCleanupOpen] = useState(false);
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

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

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

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
      return a.group_name.localeCompare(b.group_name, "el");
    });
  }, [reservationsWithOptimistic]);

  const totals = useMemo(() => {
    let present = 0;
    let total = 0;
    let anonymousAbsent = 0;
    for (const r of reservationsWithOptimistic) {
      for (const a of r.attendees) {
        total += 1;
        if (a.is_present) present += 1;
        else if (!a.member_id && !a.guest_name) anonymousAbsent += 1;
      }
    }
    return { present, total, anonymousAbsent };
  }, [reservationsWithOptimistic]);

  async function handleTogglePresence(
    attendeeId: string,
    currentlyPresent: boolean
  ) {
    const newPresent = !currentlyPresent;
    const newCheckedInAt = newPresent ? new Date().toISOString() : null;
    setOptimisticPresence((prev) => ({
      ...prev,
      [attendeeId]: { is_present: newPresent, checked_in_at: newCheckedInAt },
    }));
    setError(null);
    try {
      const supabase = getBrowserClient();
      const { error: uErr } = await supabase
        .from("reservation_attendees")
        .update({ is_present: newPresent, checked_in_at: newCheckedInAt })
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

  async function handleCleanupAnonymousAbsent() {
    setCleanupBusy(true);
    setError(null);
    try {
      const reservationIds = reservations.map((r) => r.id);
      if (reservationIds.length === 0) return;
      const supabase = getBrowserClient();
      const { error: dErr, count } = await supabase
        .from("reservation_attendees")
        .delete({ count: "exact" })
        .eq("is_present", false)
        .is("member_id", null)
        .is("guest_name", null)
        .in("reservation_id", reservationIds);
      if (dErr) throw dErr;
      setConfirmCleanupOpen(false);
      setToast(`Διαγράφηκαν ${count ?? 0} ανώνυμοι attendees.`);
      await refetch();
    } catch (err) {
      setError(errorMessage(err, "Σφάλμα κατά τη διαγραφή."));
    } finally {
      setCleanupBusy(false);
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
        {totals.anonymousAbsent > 0 && (
          <button
            type="button"
            onClick={() => setConfirmCleanupOpen(true)}
            className="rounded-lg border border-amber-500/40 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 transition hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/20"
          >
            🧹 Καθάρισε ανώνυμους απόντες ({totals.anonymousAbsent})
          </button>
        )}
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

      {/* Cleanup confirm dialog */}
      <CleanupConfirmDialog
        isOpen={confirmCleanupOpen}
        count={totals.anonymousAbsent}
        busy={cleanupBusy}
        onClose={() => setConfirmCleanupOpen(false)}
        onConfirm={handleCleanupAnonymousAbsent}
      />

      {/* Toast */}
      {toast && (
        <div
          role="status"
          className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-foreground px-4 py-2 text-sm text-background shadow-lg print:hidden"
        >
          {toast}
        </div>
      )}

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
  onTogglePresence: (attendeeId: string, currentlyPresent: boolean) => void;
}) {
  const presentCount = reservation.attendees.filter((a) => a.is_present).length;
  const totalCount = reservation.attendees.length;
  const overCapacity =
    tableCapacity != null && presentCount > tableCapacity
      ? presentCount - tableCapacity
      : 0;
  const leadAttendee = reservation.attendees.find(
    (a) => a.is_lead && a.member
  );
  const leadName = leadAttendee?.member
    ? `${leadAttendee.member.first_name} ${leadAttendee.member.last_name}`
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
            onTogglePresence={() => onTogglePresence(a.id, a.is_present)}
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
  const isAbsent = !attendee.is_present;

  let name: string;
  let kindIcon: string;
  if (isMember && attendee.member) {
    name = `${attendee.member.first_name} ${attendee.member.last_name}`;
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
      aria-pressed={attendee.is_present}
      className={`flex cursor-pointer items-center justify-between gap-2 rounded-md border border-border bg-surface px-2.5 py-2 text-sm transition-all duration-150 hover:bg-background print:cursor-default print:py-1.5 print:hover:bg-transparent ${
        isAbsent ? "opacity-60" : "opacity-100"
      }`}
    >
      <span className="flex min-w-0 items-center gap-2 truncate">
        <span aria-hidden className="hidden print:inline">
          {attendee.is_present ? "✓" : "⏸"}
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

function CleanupConfirmDialog({
  isOpen,
  count,
  busy,
  onClose,
  onConfirm,
}: {
  isOpen: boolean;
  count: number;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, busy, onClose]);

  if (!isOpen) return null;
  const MAROON = "#800000";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      role="alertdialog"
      aria-modal="true"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between gap-3 border-b-2 px-5 py-3"
          style={{ borderColor: MAROON, color: MAROON }}
        >
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <span aria-hidden>🧹</span>
            Καθάρισε ανώνυμους απόντες;
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded p-1 text-muted transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Κλείσιμο"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3 px-5 py-4 text-sm">
          <p>
            Θα διαγραφούν{" "}
            <span className="font-semibold">{count}</span> ανώνυμοι attendees
            που δεν ήρθαν. Δεν επηρεάζει ονοματισμένους ή παρόντες.
          </p>
          <p className="text-muted">
            Αυτή η ενέργεια <strong>δεν αναιρείται</strong>.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-border bg-white px-4 py-1.5 text-sm transition hover:bg-background disabled:cursor-not-allowed disabled:opacity-50 dark:bg-transparent"
          >
            Ακύρωση
          </button>
          <button
            type="button"
            onClick={() => {
              if (!busy) void onConfirm();
            }}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: MAROON }}
          >
            {busy ? (
              <>
                <span
                  className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white"
                  aria-hidden
                />
                Διαγραφή…
              </>
            ) : (
              <>
                <span aria-hidden>🗑️</span>
                Διαγραφή {count} attendees
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
