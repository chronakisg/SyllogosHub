"use client";

import { useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { errorMessage, getBrowserClient } from "@/lib/supabase/client";
import { useRole } from "@/lib/hooks/useRole";
import { useCurrentClub } from "@/lib/hooks/useCurrentClub";
import { AccessDenied } from "@/lib/auth/AccessDenied";
import type {
  Event as EventRow,
  Guest,
  Member,
  Reservation,
} from "@/lib/supabase/types";
import {
  RESERVATION_SELECT,
  getAttendeeCount,
  hasAnonymousAttendees,
  type ReservationWithAttendees,
} from "@/lib/utils/attendees";
import { AttendeesEditor } from "@/components/AttendeesEditor";

type TableShape = "round" | "square";

type VenueTable = {
  id: string;
  number: number;
  shape: TableShape;
  capacity: number;
  is_reserved?: boolean;
  reserved_label?: string;
};

type VenueMapConfig = {
  tables: VenueTable[];
};

function parseVenueConfig(raw: unknown): VenueMapConfig {
  if (!raw || typeof raw !== "object") return { tables: [] };
  const rec = raw as Record<string, unknown>;
  const list = Array.isArray(rec.tables) ? rec.tables : [];
  const tables: VenueTable[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const v = item as Record<string, unknown>;
    if (
      typeof v.id === "string" &&
      typeof v.number === "number" &&
      (v.shape === "round" || v.shape === "square") &&
      typeof v.capacity === "number"
    ) {
      const t: VenueTable = {
        id: v.id,
        number: v.number,
        shape: v.shape,
        capacity: v.capacity,
      };
      if (typeof v.is_reserved === "boolean") t.is_reserved = v.is_reserved;
      if (typeof v.reserved_label === "string" && v.reserved_label.length > 0)
        t.reserved_label = v.reserved_label;
      tables.push(t);
    }
  }
  tables.sort((a, b) => a.number - b.number);
  return { tables };
}

function genId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const DND_MIME = "text/plain";
const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

export default function SeatingPage() {
  return (
    <Suspense fallback={<div className="p-6 text-muted">Φόρτωση…</div>}>
      <SeatingView />
    </Suspense>
  );
}

function SeatingView() {
  const role = useRole();
  const { clubId, loading: clubLoading } = useCurrentClub();
  const searchParams = useSearchParams();
  const eventParam = searchParams.get("event");
  const [events, setEvents] = useState<EventRow[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(
    eventParam
  );
  const [loadedEventId, setLoadedEventId] = useState<string | null>(null);
  const [eventsLoaded, setEventsLoaded] = useState(false);
  const initialLoading = clubLoading || (clubId !== null && !eventsLoaded);
  const [error, setError] = useState<string | null>(null);
  const eventLoading =
    selectedEventId != null && loadedEventId !== selectedEventId;

  const [venueConfig, setVenueConfig] = useState<VenueMapConfig>({
    tables: [],
  });
  const [reservations, setReservations] = useState<ReservationWithAttendees[]>(
    []
  );
  const [selectedReservationId, setSelectedReservationId] = useState<
    string | null
  >(null);
  const [realtimeReady, setRealtimeReady] = useState(false);

  const [addTableOpen, setAddTableOpen] = useState(false);
  const [batchTablesOpen, setBatchTablesOpen] = useState(false);
  const [addReservationOpen, setAddReservationOpen] = useState(false);
  const [addEventOpen, setAddEventOpen] = useState(false);
  const [groupSearch, setGroupSearch] = useState("");
  const [guestPanelReservationId, setGuestPanelReservationId] = useState<
    string | null
  >(null);
  const [attendeesEditorReservationId, setAttendeesEditorReservationId] =
    useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);

  useEffect(() => {
    if (!clubId) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = getBrowserClient();
        const { data, error: qErr } = await supabase
          .from("members")
          .select("*")
          .eq("club_id", clubId)
          .eq("status", "active")
          .order("last_name", { ascending: true })
          .order("first_name", { ascending: true });
        if (cancelled) return;
        if (qErr) throw qErr;
        setMembers(data ?? []);
      } catch {
        // Silent — guest panel just won't have member suggestions.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clubId]);

  const tablesByNumber = useMemo(() => {
    const m = new Map<number, VenueTable>();
    for (const t of venueConfig.tables) m.set(t.number, t);
    return m;
  }, [venueConfig]);

  const reservationByTableNumber = useMemo(() => {
    const m = new Map<number, ReservationWithAttendees>();
    for (const r of reservations) {
      if (r.table_number != null) m.set(r.table_number, r);
    }
    return m;
  }, [reservations]);

  const unassigned = useMemo(() => {
    const q = groupSearch.trim().toLowerCase();
    return reservations
      .filter((r) => r.table_number == null)
      .filter((r) => !q || r.group_name.toLowerCase().includes(q))
      .sort((a, b) => a.group_name.localeCompare(b.group_name, "el"));
  }, [reservations, groupSearch]);

  const loadEventData = useCallback(
    async (eventId: string) => {
      if (!clubId) return;
      try {
        const supabase = getBrowserClient();
        const [evRes, resRes] = await Promise.all([
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
        if (resRes.error) throw resRes.error;
        setError(null);
        setVenueConfig(parseVenueConfig(evRes.data.venue_map_config));
        setReservations(
          (resRes.data ?? []) as unknown as ReservationWithAttendees[]
        );
        setLoadedEventId(eventId);
      } catch (err) {
        setError(errorMessage(err, "Σφάλμα φόρτωσης δεδομένων."));
      }
    },
    [clubId]
  );

  const refetchReservations = useCallback(
    async (eventId: string) => {
      if (!clubId) return;
      try {
        const supabase = getBrowserClient();
        const { data, error: qErr } = await supabase
          .from("reservations")
          .select(RESERVATION_SELECT)
          .eq("event_id", eventId)
          .eq("club_id", clubId);
        if (qErr) throw qErr;
        setReservations(
          (data ?? []) as unknown as ReservationWithAttendees[]
        );
      } catch (err) {
        setError(errorMessage(err, "Σφάλμα ανανέωσης παρευρισκόμενων."));
      }
    },
    [clubId]
  );

  useEffect(() => {
    if (clubLoading || !clubId) return;
    let cancelled = false;
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
        const list = data ?? [];
        setEvents(list);
        setSelectedEventId((prev) => {
          if (prev && list.some((e) => e.id === prev)) return prev;
          return list[0]?.id ?? null;
        });
      } catch (err) {
        if (cancelled) return;
        setError(errorMessage(err, "Σφάλμα φόρτωσης εκδηλώσεων."));
      } finally {
        if (!cancelled) setEventsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clubId, clubLoading]);

  useEffect(() => {
    if (!selectedEventId || !clubId) return;
    const eventId = selectedEventId;
    let cancelled = false;
    (async () => {
      try {
        const supabase = getBrowserClient();
        const [evRes, resRes] = await Promise.all([
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
        if (cancelled) return;
        if (evRes.error) throw evRes.error;
        if (resRes.error) throw resRes.error;
        setError(null);
        setVenueConfig(parseVenueConfig(evRes.data.venue_map_config));
        setReservations(
          (resRes.data ?? []) as unknown as ReservationWithAttendees[]
        );
        setLoadedEventId(eventId);
      } catch (err) {
        if (cancelled) return;
        setError(errorMessage(err, "Σφάλμα φόρτωσης δεδομένων."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedEventId, clubId]);

  useEffect(() => {
    if (!selectedEventId) return;
    const eventId = selectedEventId;
    const supabase = getBrowserClient();
    const reservationsChannel = supabase
      .channel(`reservations:event:${eventId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "reservations",
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as Reservation;
            setReservations((prev) =>
              prev.some((r) => r.id === row.id)
                ? prev
                : [...prev, { ...row, attendees: [] }]
            );
          } else if (payload.eventType === "UPDATE") {
            const row = payload.new as Reservation;
            setReservations((prev) =>
              prev.map((r) =>
                r.id === row.id ? { ...row, attendees: r.attendees } : r
              )
            );
          } else if (payload.eventType === "DELETE") {
            const old = payload.old as Partial<Reservation>;
            if (old.id) {
              const oldId = old.id;
              setReservations((prev) => prev.filter((r) => r.id !== oldId));
            }
          }
        }
      )
      .subscribe((status) => {
        setRealtimeReady(status === "SUBSCRIBED");
      });

    const attendeesChannel = supabase
      .channel(`attendees:event:${eventId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "reservation_attendees",
        },
        () => {
          refetchReservations(eventId);
        }
      )
      .subscribe();

    return () => {
      setRealtimeReady(false);
      supabase.removeChannel(reservationsChannel);
      supabase.removeChannel(attendeesChannel);
    };
  }, [selectedEventId, refetchReservations]);

  const assignReservation = useCallback(
    async (reservationId: string, tableNumber: number | null) => {
      setReservations((prev) =>
        prev.map((r) =>
          r.id === reservationId ? { ...r, table_number: tableNumber } : r
        )
      );
      setSelectedReservationId(null);
      if (!clubId) return;
      try {
        const supabase = getBrowserClient();
        const { error: uErr } = await supabase
          .from("reservations")
          .update({ table_number: tableNumber })
          .eq("id", reservationId)
          .eq("club_id", clubId);
        if (uErr) throw uErr;
      } catch (err) {
        setError(errorMessage(err, "Σφάλμα κατά την ανάθεση παρέας."));
        if (selectedEventId) loadEventData(selectedEventId);
      }
    },
    [loadEventData, selectedEventId, clubId]
  );

  const saveVenueConfig = useCallback(
    async (next: VenueMapConfig) => {
      if (!selectedEventId || !clubId) return;
      setVenueConfig(next);
      try {
        const supabase = getBrowserClient();
        const { error: uErr } = await supabase
          .from("events")
          .update({ venue_map_config: next })
          .eq("id", selectedEventId)
          .eq("club_id", clubId);
        if (uErr) throw uErr;
      } catch (err) {
        setError(errorMessage(err, "Σφάλμα αποθήκευσης διαμόρφωσης χώρου."));
        if (selectedEventId) loadEventData(selectedEventId);
      }
    },
    [selectedEventId, loadEventData, clubId]
  );

  const handleAddTable = useCallback(
    async (input: { number: number; shape: TableShape; capacity: number }) => {
      if (tablesByNumber.has(input.number)) {
        setError(`Υπάρχει ήδη τραπέζι με αριθμό ${input.number}.`);
        return;
      }
      await saveVenueConfig({
        tables: [
          ...venueConfig.tables,
          { id: genId(), ...input },
        ].sort((a, b) => a.number - b.number),
      });
    },
    [tablesByNumber, venueConfig.tables, saveVenueConfig]
  );

  const handleBatchAddTables = useCallback(
    async (input: { from: number; to: number; capacity: number }) => {
      const existing = new Set(venueConfig.tables.map((t) => t.number));
      const additions: VenueTable[] = [];
      for (let n = input.from; n <= input.to; n++) {
        if (existing.has(n)) continue;
        additions.push({
          id: genId(),
          number: n,
          shape: "round",
          capacity: input.capacity,
        });
      }
      if (additions.length === 0) return;
      await saveVenueConfig({
        tables: [...venueConfig.tables, ...additions].sort(
          (a, b) => a.number - b.number
        ),
      });
    },
    [venueConfig.tables, saveVenueConfig]
  );

  const handleUpdateCapacity = useCallback(
    async (tableId: string, capacity: number) => {
      if (capacity < 1 || capacity > 30) return;
      await saveVenueConfig({
        tables: venueConfig.tables.map((t) =>
          t.id === tableId ? { ...t, capacity } : t
        ),
      });
    },
    [venueConfig.tables, saveVenueConfig]
  );

  const handleToggleShape = useCallback(
    async (tableId: string) => {
      await saveVenueConfig({
        tables: venueConfig.tables.map((t) =>
          t.id === tableId
            ? { ...t, shape: t.shape === "round" ? "square" : "round" }
            : t
        ),
      });
    },
    [venueConfig.tables, saveVenueConfig]
  );

  const handleToggleReserved = useCallback(
    async (tableId: string) => {
      await saveVenueConfig({
        tables: venueConfig.tables.map((t) => {
          if (t.id !== tableId) return t;
          const next: VenueTable = { ...t, is_reserved: !t.is_reserved };
          if (!next.is_reserved) delete next.reserved_label;
          return next;
        }),
      });
    },
    [venueConfig.tables, saveVenueConfig]
  );

  const handleUpdateReservedLabel = useCallback(
    async (tableId: string, label: string) => {
      const trimmed = label.trim();
      await saveVenueConfig({
        tables: venueConfig.tables.map((t) => {
          if (t.id !== tableId) return t;
          const next: VenueTable = { ...t };
          if (trimmed.length > 0) next.reserved_label = trimmed;
          else delete next.reserved_label;
          return next;
        }),
      });
    },
    [venueConfig.tables, saveVenueConfig]
  );

  const handleUpdateGuests = useCallback(
    async (reservationId: string, guests: Guest[]) => {
      if (!clubId) return;
      const previous = reservations;
      setReservations((prev) =>
        prev.map((r) => (r.id === reservationId ? { ...r, guests } : r))
      );
      try {
        const supabase = getBrowserClient();
        const { error: uErr } = await supabase
          .from("reservations")
          .update({ guests })
          .eq("id", reservationId)
          .eq("club_id", clubId);
        if (uErr) throw uErr;
      } catch (err) {
        setReservations(previous);
        setError(errorMessage(err, "Σφάλμα αποθήκευσης καλεσμένων."));
      }
    },
    [reservations, clubId]
  );

  const handleRemoveTable = useCallback(
    async (tableId: string) => {
      const target = venueConfig.tables.find((x) => x.id === tableId);
      if (!target) return;
      const occupant = reservationByTableNumber.get(target.number);
      if (occupant) {
        const ok = window.confirm(
          `Το τραπέζι Νο ${target.number} φιλοξενεί την παρέα «${occupant.group_name}». Θα αποαντιστοιχιστεί. Συνέχεια;`
        );
        if (!ok) return;
        await assignReservation(occupant.id, null);
      }
      await saveVenueConfig({
        tables: venueConfig.tables.filter((x) => x.id !== tableId),
      });
    },
    [
      venueConfig.tables,
      reservationByTableNumber,
      assignReservation,
      saveVenueConfig,
    ]
  );

  const handleCreateReservation = useCallback(
    async (input: {
      group_name: string;
      pax_count: number;
      is_paid: boolean;
    }) => {
      if (!selectedEventId || !clubId) return;
      try {
        const supabase = getBrowserClient();
        const { data: created, error: iErr } = await supabase
          .from("reservations")
          .insert({
            club_id: clubId,
            event_id: selectedEventId,
            group_name: input.group_name,
            pax_count: input.pax_count,
            is_paid: input.is_paid,
            table_number: null,
          })
          .select("id")
          .single();
        if (iErr) throw iErr;

        if (created && input.pax_count > 0) {
          const rows = Array.from({ length: input.pax_count }, () => ({
            reservation_id: created.id,
            club_id: clubId,
          }));
          const { error: aErr } = await supabase
            .from("reservation_attendees")
            .insert(rows);
          if (aErr) {
            console.error(
              "Reservation created but seeding anonymous attendees failed",
              aErr
            );
          }
        }
      } catch (err) {
        setError(errorMessage(err, "Σφάλμα δημιουργίας παρέας."));
      }
    },
    [selectedEventId, clubId]
  );

  const handleCreateEvent = useCallback(
    async (input: { event_name: string; event_date: string }) => {
      if (!clubId) return;
      try {
        const supabase = getBrowserClient();
        const { data, error: iErr } = await supabase
          .from("events")
          .insert({
            club_id: clubId,
            event_name: input.event_name,
            event_date: input.event_date,
            venue_map_config: { tables: [] },
          })
          .select()
          .single();
        if (iErr) throw iErr;
        if (data) {
          setEvents((prev) => [data, ...prev]);
          setSelectedEventId(data.id);
        }
      } catch (err) {
        setError(errorMessage(err, "Σφάλμα δημιουργίας εκδήλωσης."));
      }
    },
    [clubId]
  );

  const activeEvent =
    events.find((e) => e.id === selectedEventId) ?? null;

  const revenueStats = useMemo(() => {
    const totalPax = reservations.reduce(
      (s, r) => s + getAttendeeCount(r),
      0
    );
    const paidGroups = reservations.filter((r) => r.is_paid).length;
    const pendingGroups = reservations.length - paidGroups;
    return { totalPax, paidGroups, pendingGroups };
  }, [reservations]);

  if (role.loading) {
    return (
      <div className="mx-auto w-full max-w-6xl p-10 text-center text-muted">
        Φόρτωση…
      </div>
    );
  }
  if (role.userId && !role.permissions.includes("seating")) {
    return <AccessDenied />;
  }

  return (
    <div className="mx-auto w-full max-w-384">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted">Εκδηλώσεις</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Πλάνο Τραπεζιών
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Διαμορφώστε τα τραπέζια και αναθέστε παρέες. Οι αλλαγές
            συγχρονίζονται σε πραγματικό χρόνο σε όλες τις συσκευές.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selectedEventId && (
            <a
              href={`/seating/entrance-list?event=${selectedEventId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-border px-3 py-2 text-sm transition hover:bg-background"
            >
              📋 Λίστα Εισόδου & Check-in
            </a>
          )}
          <RealtimeIndicator ready={realtimeReady} />
        </div>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label htmlFor="event-picker" className="text-sm text-muted">
          Εκδήλωση:
        </label>
        <select
          id="event-picker"
          value={selectedEventId ?? ""}
          onChange={(e) => setSelectedEventId(e.target.value || null)}
          disabled={initialLoading || events.length === 0}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-60"
        >
          {events.length === 0 ? (
            <option value="">— Καμία εκδήλωση —</option>
          ) : (
            events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.event_name} —{" "}
                {new Date(ev.event_date).toLocaleDateString("el-GR")}
              </option>
            ))
          )}
        </select>
        <button
          type="button"
          onClick={() => setAddEventOpen(true)}
          className="rounded-lg border border-border px-3 py-2 text-sm transition hover:bg-background"
        >
          + Νέα Εκδήλωση
        </button>
      </div>

      {error && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="shrink-0 rounded px-2 text-xs hover:opacity-70"
            aria-label="Κλείσιμο"
          >
            ✕
          </button>
        </div>
      )}

      {activeEvent && (
        <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm">
          <span className="text-muted">
            Σύνολο ατόμων:{" "}
            <span className="font-semibold text-foreground">
              {revenueStats.totalPax}
            </span>
          </span>
          <span className="text-muted">
            Πληρωμένες παρέες:{" "}
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
              {revenueStats.paidGroups}
            </span>
          </span>
          <span className="text-muted">
            Εκκρεμείς:{" "}
            <span className="font-semibold text-amber-600 dark:text-amber-400">
              {revenueStats.pendingGroups}
            </span>
          </span>
        </div>
      )}

      {initialLoading ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center text-muted">
          Φόρτωση…
        </div>
      ) : !activeEvent ? (
        <div className="rounded-xl border border-dashed border-border bg-surface p-10 text-center text-muted">
          Δεν υπάρχει εκδήλωση. Πατήστε «Νέα Εκδήλωση» για να ξεκινήσετε.
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
          <aside
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData(DND_MIME);
              if (id) assignReservation(id, null);
            }}
            className="order-2 flex flex-col rounded-xl border border-border bg-surface p-4 lg:order-1"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold">Παρέες χωρίς τραπέζι</h2>
                <p className="text-xs text-muted">
                  {unassigned.length}{" "}
                  {unassigned.length === 1 ? "παρέα" : "παρέες"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAddReservationOpen(true)}
                className="rounded-md border border-border px-2 py-1 text-xs transition hover:bg-background"
              >
                + Νέα Παρέα
              </button>
            </div>

            <div className="mb-3">
              <input
                type="search"
                value={groupSearch}
                onChange={(e) => setGroupSearch(e.target.value)}
                placeholder="Αναζήτηση παρέας…"
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
            </div>

            {selectedReservationId && (
              <div className="mb-3 flex items-center justify-between gap-2 rounded-md border border-accent/40 bg-accent/10 px-2 py-1.5 text-xs text-accent">
                <span>Πατήστε ένα τραπέζι για αντιστοίχιση.</span>
                <button
                  type="button"
                  onClick={() => setSelectedReservationId(null)}
                  className="rounded px-1 text-xs hover:opacity-80"
                >
                  Άκυρο
                </button>
              </div>
            )}

            {unassigned.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted">
                {groupSearch.trim()
                  ? "Καμία παρέα δεν ταιριάζει στην αναζήτηση."
                  : "Όλες οι παρέες έχουν τραπέζι."}
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {unassigned.map((r) => (
                  <li key={r.id}>
                    <ReservationChip
                      reservation={r}
                      selected={selectedReservationId === r.id}
                      onToggleSelect={() =>
                        setSelectedReservationId((prev) =>
                          prev === r.id ? null : r.id
                        )
                      }
                      onOpenAttendees={() =>
                        setAttendeesEditorReservationId(r.id)
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <section className="order-1 rounded-xl border border-border bg-surface p-4 lg:order-2">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold">Διαμόρφωση Χώρου</h2>
                <p className="text-xs text-muted">
                  {venueConfig.tables.length} τραπέζια ·{" "}
                  {reservationByTableNumber.size} κατειλημμένα
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setBatchTablesOpen(true)}
                  className="rounded-lg border border-border px-3 py-2 text-sm transition hover:bg-background"
                >
                  Μαζική Δημιουργία
                </button>
                <button
                  type="button"
                  onClick={() => setAddTableOpen(true)}
                  className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition hover:opacity-90"
                >
                  + Προσθήκη Τραπεζιού
                </button>
              </div>
            </div>

            {eventLoading ? (
              <div className="py-10 text-center text-muted">Φόρτωση…</div>
            ) : venueConfig.tables.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted">
                Δεν έχουν οριστεί τραπέζια για αυτή την εκδήλωση. Πατήστε
                «Προσθήκη Τραπεζιού» για να ξεκινήσετε.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                {venueConfig.tables.map((t) => (
                  <TableCard
                    key={t.id}
                    table={t}
                    reservation={reservationByTableNumber.get(t.number) ?? null}
                    pendingAssign={!!selectedReservationId}
                    onTableClick={() => {
                      if (selectedReservationId) {
                        assignReservation(selectedReservationId, t.number);
                      }
                    }}
                    onDropReservation={(id) =>
                      assignReservation(id, t.number)
                    }
                    onUnassign={() => {
                      const occupant = reservationByTableNumber.get(t.number);
                      if (occupant) assignReservation(occupant.id, null);
                    }}
                    onRemoveTable={() => handleRemoveTable(t.id)}
                    onUpdateCapacity={(c) => handleUpdateCapacity(t.id, c)}
                    onToggleShape={() => handleToggleShape(t.id)}
                    onToggleReserved={() => handleToggleReserved(t.id)}
                    onUpdateReservedLabel={(l) =>
                      handleUpdateReservedLabel(t.id, l)
                    }
                    onOpenGuests={(reservationId) =>
                      setGuestPanelReservationId(reservationId)
                    }
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {addTableOpen && (
        <AddTableModal
          existingNumbers={Array.from(tablesByNumber.keys())}
          onClose={() => setAddTableOpen(false)}
          onSubmit={async (input) => {
            await handleAddTable(input);
            setAddTableOpen(false);
          }}
        />
      )}
      {batchTablesOpen && (
        <BatchTablesModal
          existingNumbers={Array.from(tablesByNumber.keys())}
          onClose={() => setBatchTablesOpen(false)}
          onSubmit={async (input) => {
            await handleBatchAddTables(input);
            setBatchTablesOpen(false);
          }}
        />
      )}
      {addReservationOpen && (
        <AddReservationModal
          onClose={() => setAddReservationOpen(false)}
          onSubmit={async (input) => {
            await handleCreateReservation(input);
            setAddReservationOpen(false);
          }}
        />
      )}
      {addEventOpen && (
        <AddEventModal
          onClose={() => setAddEventOpen(false)}
          onSubmit={async (input) => {
            await handleCreateEvent(input);
            setAddEventOpen(false);
          }}
        />
      )}
      {guestPanelReservationId &&
        (() => {
          const reservation = reservations.find(
            (r) => r.id === guestPanelReservationId
          );
          if (!reservation) return null;
          const table =
            reservation.table_number != null
              ? tablesByNumber.get(reservation.table_number) ?? null
              : null;
          return (
            <GuestsPanel
              reservation={reservation}
              tableCapacity={table?.capacity ?? null}
              members={members}
              onClose={() => setGuestPanelReservationId(null)}
              onChange={(guests) =>
                handleUpdateGuests(reservation.id, guests)
              }
            />
          );
        })()}
      {attendeesEditorReservationId &&
        (() => {
          const reservation = reservations.find(
            (r) => r.id === attendeesEditorReservationId
          );
          if (!reservation) return null;
          return (
            <AttendeesEditor
              reservation={reservation}
              members={members}
              onClose={() => setAttendeesEditorReservationId(null)}
              onUpdate={() => {
                if (selectedEventId) {
                  return refetchReservations(selectedEventId);
                }
              }}
            />
          );
        })()}
    </div>
  );
}

function RealtimeIndicator({ ready }: { ready: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted">
      <span
        className={
          "relative flex h-2 w-2 " + (ready ? "text-emerald-500" : "")
        }
      >
        <span
          className={
            "absolute inline-flex h-full w-full rounded-full opacity-70 " +
            (ready ? "animate-ping bg-emerald-400" : "")
          }
        />
        <span
          className={
            "relative inline-flex h-2 w-2 rounded-full " +
            (ready ? "bg-emerald-500" : "bg-slate-400")
          }
        />
      </span>
      {ready ? "Συγχρονισμός ενεργός" : "Σύνδεση…"}
    </span>
  );
}

function ReservationChip({
  reservation,
  selected,
  onToggleSelect,
  onOpenAttendees,
}: {
  reservation: ReservationWithAttendees;
  selected: boolean;
  onToggleSelect: () => void;
  onOpenAttendees: () => void;
}) {
  const count = getAttendeeCount(reservation);
  const anonymous = hasAnonymousAttendees(reservation);
  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DND_MIME, reservation.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={onToggleSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggleSelect();
        }
      }}
      className={
        "cursor-grab select-none rounded-lg border bg-background p-3 transition active:cursor-grabbing " +
        (selected
          ? "border-accent ring-2 ring-accent/30"
          : "border-border hover:border-accent/60")
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">
            {reservation.group_name}
          </div>
          <div className="mt-0.5 text-xs text-muted">
            {count} {count === 1 ? "άτομο" : "άτομα"}
            {anonymous && (
              <span
                className="ml-1 text-amber-600 dark:text-amber-400"
                title="Έχει ανώνυμα μέλη — προσθέστε ονόματα"
              >
                ⚠
              </span>
            )}
            {reservation.is_paid ? " · Πληρωμένο" : ""}
          </div>
        </div>
        <button
          type="button"
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            onOpenAttendees();
          }}
          onKeyDown={(e) => e.stopPropagation()}
          className="shrink-0 rounded-md border border-border bg-surface px-2 py-1 text-xs transition hover:bg-background"
          title="Διαχείριση ατόμων"
          aria-label="Διαχείριση ατόμων"
        >
          👤
        </button>
      </div>
    </div>
  );
}

type PaymentStatus = "none" | "paid" | "mixed";

function paymentStatus(list: ReservationWithAttendees[]): PaymentStatus {
  if (list.length === 0) return "none";
  const paidCount = list.filter((r) => r.is_paid).length;
  if (paidCount === 0) return "none";
  if (paidCount === list.length) return "paid";
  return "mixed";
}

function TableCard({
  table,
  reservation,
  pendingAssign,
  onTableClick,
  onDropReservation,
  onUnassign,
  onRemoveTable,
  onUpdateCapacity,
  onToggleShape,
  onToggleReserved,
  onUpdateReservedLabel,
  onOpenGuests,
}: {
  table: VenueTable;
  reservation: ReservationWithAttendees | null;
  pendingAssign: boolean;
  onTableClick: () => void;
  onDropReservation: (reservationId: string) => void;
  onUnassign: () => void;
  onRemoveTable: () => void;
  onUpdateCapacity: (capacity: number) => void;
  onToggleShape: () => void;
  onToggleReserved: () => void;
  onUpdateReservedLabel: (label: string) => void;
  onOpenGuests: (reservationId: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const reservationCount = reservation ? getAttendeeCount(reservation) : 0;
  const reservationAnonymous = reservation
    ? hasAnonymousAttendees(reservation)
    : false;
  const overCapacity = reservation
    ? reservationCount > table.capacity
    : false;
  const shapeClasses =
    table.shape === "round" ? "rounded-full" : "rounded-xl";

  const isReserved = !!table.is_reserved;
  const isOccupied = !!reservation;
  const lockDisabled = isOccupied;
  const isRound = table.shape === "round";
  const cornerLockClass = isRound
    ? "top-[15%] left-[15%]"
    : "top-1.5 left-1.5";
  const cornerShapeClass = isRound
    ? "bottom-[15%] left-[15%]"
    : "bottom-1.5 left-1.5";

  const status = paymentStatus(reservation ? [reservation] : []);
  const paidBorderClass =
    status === "paid"
      ? "border-green-500"
      : status === "mixed"
        ? "border-yellow-400"
        : "";

  let cardSurfaceClass: string;
  if (dragOver || pendingAssign) {
    cardSurfaceClass = "border-accent bg-accent/10";
  } else if (isReserved) {
    cardSurfaceClass =
      "border-yellow-400 bg-yellow-50 dark:bg-yellow-500/10";
  } else if (reservation) {
    cardSurfaceClass = (paidBorderClass || "border-border") + " bg-background";
  } else {
    cardSurfaceClass =
      "border-dashed border-border bg-surface hover:border-accent/60";
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const id = e.dataTransfer.getData(DND_MIME);
        if (id) onDropReservation(id);
      }}
      onClick={onTableClick}
      className={
        "relative flex aspect-square cursor-pointer flex-col items-center justify-center border-2 p-3 text-center transition " +
        shapeClasses +
        " " +
        cardSurfaceClass
      }
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (lockDisabled) return;
          onToggleReserved();
        }}
        disabled={lockDisabled}
        aria-label={
          isReserved ? "Αφαίρεση κράτησης τραπεζιού" : "Κράτηση τραπεζιού"
        }
        title={
          lockDisabled
            ? "Αφαίρεσε πρώτα την παρέα"
            : isReserved
              ? "Αφαίρεση κράτησης"
              : "Κράτηση τραπεζιού"
        }
        className={
          "absolute inline-flex h-8 w-8 items-center justify-center rounded-full border bg-surface text-base leading-none transition disabled:cursor-not-allowed disabled:opacity-40 " +
          cornerLockClass +
          " " +
          (isReserved
            ? "border-yellow-400 text-yellow-700 hover:bg-yellow-100 dark:text-yellow-200 dark:hover:bg-yellow-500/20"
            : "border-border text-muted hover:border-yellow-400 hover:text-yellow-700 dark:hover:text-yellow-200")
        }
      >
        {isReserved ? "🔒" : "🔓"}
      </button>
      <button
        type="button"
        title={reservation ? "Αποαντιστοίχιση παρέας" : "Διαγραφή τραπεζιού"}
        onClick={(e) => {
          e.stopPropagation();
          if (reservation) onUnassign();
          else onRemoveTable();
        }}
        className="absolute right-1.5 top-1.5 rounded-full border border-border bg-surface px-1.5 py-0.5 text-[10px] text-muted transition hover:border-danger/50 hover:text-danger"
      >
        {reservation ? "Αφαίρεση" : "✕"}
      </button>

      <div className="text-2xl font-semibold leading-none">
        Νο {table.number}
      </div>
      <div
        className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onUpdateCapacity(table.capacity - 1);
          }}
          disabled={table.capacity <= 1}
          aria-label="Μείωση χωρητικότητας"
          className="flex h-5 w-5 items-center justify-center rounded border border-border bg-surface text-xs leading-none transition hover:bg-background disabled:opacity-40"
        >
          −
        </button>
        <span className="min-w-14 text-center">
          {table.capacity} θέσεις
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onUpdateCapacity(table.capacity + 1);
          }}
          disabled={table.capacity >= 30}
          aria-label="Αύξηση χωρητικότητας"
          className="flex h-5 w-5 items-center justify-center rounded border border-border bg-surface text-xs leading-none transition hover:bg-background disabled:opacity-40"
        >
          +
        </button>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleShape();
        }}
        aria-label={
          table.shape === "round"
            ? "Αλλαγή σε τετράγωνο"
            : "Αλλαγή σε στρογγυλό"
        }
        title={
          table.shape === "round"
            ? "Αλλαγή σε τετράγωνο"
            : "Αλλαγή σε στρογγυλό"
        }
        className={
          "absolute inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface text-base leading-none text-muted transition hover:border-accent/60 hover:text-foreground " +
          cornerShapeClass
        }
      >
        {table.shape === "round" ? "▢" : "◯"}
      </button>

      <TableLabelEdit
        customLabel={table.reserved_label}
        defaultLabel={reservation?.group_name}
        fallback={isReserved ? "— Κρατημένο —" : "— ελεύθερο —"}
        emphasized={!!reservation}
        onSave={onUpdateReservedLabel}
      />

      {reservation && (
        <div
          draggable
          onDragStart={(e) => {
            e.stopPropagation();
            e.dataTransfer.setData(DND_MIME, reservation.id);
            e.dataTransfer.effectAllowed = "move";
          }}
          onClick={(e) => {
            e.stopPropagation();
            onOpenGuests(reservation.id);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onOpenGuests(reservation.id);
            }
          }}
          className={
            "mt-1 inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs font-medium active:cursor-grabbing " +
            (overCapacity
              ? "bg-danger/10 text-danger"
              : "bg-accent/10 text-accent")
          }
          title={
            overCapacity
              ? `Προσοχή: ${reservationCount} άτομα σε τραπέζι ${table.capacity} θέσεων`
              : reservationAnonymous
                ? "Διαχείριση καλεσμένων (έχει ανώνυμα μέλη)"
                : "Διαχείριση καλεσμένων"
          }
        >
          <span>· {reservationCount}</span>
          {(overCapacity || reservationAnonymous) && <span aria-hidden>⚠</span>}
        </div>
      )}
    </div>
  );
}

function TableLabelEdit({
  customLabel,
  defaultLabel,
  fallback,
  emphasized,
  onSave,
}: {
  customLabel: string | undefined;
  defaultLabel: string | undefined;
  fallback: string;
  emphasized: boolean;
  onSave: (label: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  function startEdit() {
    setDraft(customLabel ?? defaultLabel ?? "");
    setEditing(true);
  }

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    const next =
      trimmed === "" || trimmed === (defaultLabel ?? "") ? "" : trimmed;
    if (next !== (customLabel ?? "")) {
      onSave(next);
    }
  }

  function cancel() {
    setEditing(false);
  }

  if (editing) {
    return (
      <div
        className="mt-1 flex w-full justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
          maxLength={60}
          placeholder="Ετικέτα τραπεζιού"
          className="w-full max-w-[10rem] rounded border border-yellow-400 bg-background px-1.5 py-0.5 text-center text-xs outline-none focus:ring-2 focus:ring-yellow-400/30"
        />
      </div>
    );
  }

  const isCustom = !!customLabel;
  const isPlaceholder = !customLabel && !defaultLabel;
  const displayText = customLabel ?? defaultLabel ?? fallback;

  let appearanceClass: string;
  if (isCustom) {
    appearanceClass =
      "bg-yellow-100 text-yellow-900 hover:bg-yellow-200 dark:bg-yellow-500/20 dark:text-yellow-100 dark:hover:bg-yellow-500/30";
  } else if (emphasized) {
    appearanceClass =
      "text-foreground hover:bg-yellow-100/40 dark:hover:bg-yellow-500/10";
  } else {
    appearanceClass =
      "text-muted hover:bg-yellow-100/40 dark:hover:bg-yellow-500/10";
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        startEdit();
      }}
      className={
        "mt-1 inline-flex min-h-8 max-w-[10rem] items-center justify-center truncate rounded px-2 py-1 text-xs font-medium transition " +
        appearanceClass
      }
      title={
        isCustom
          ? "Επεξεργασία ετικέτας"
          : isPlaceholder
            ? "Πρόσθεσε ετικέτα τραπεζιού"
            : "Επεξεργασία ετικέτας τραπεζιού"
      }
    >
      {displayText}
    </button>
  );
}

function AddTableModal({
  existingNumbers,
  onClose,
  onSubmit,
}: {
  existingNumbers: number[];
  onClose: () => void;
  onSubmit: (input: {
    number: number;
    shape: TableShape;
    capacity: number;
  }) => Promise<void>;
}) {
  const suggested =
    existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
  const [number, setNumber] = useState(String(suggested));
  const [shape, setShape] = useState<TableShape>("round");
  const [capacity, setCapacity] = useState("8");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const n = Number(number);
    const c = Number(capacity);
    if (!Number.isInteger(n) || n <= 0) {
      setErr("Ο αριθμός τραπεζιού πρέπει να είναι θετικός ακέραιος.");
      return;
    }
    if (existingNumbers.includes(n)) {
      setErr(`Υπάρχει ήδη τραπέζι με αριθμό ${n}.`);
      return;
    }
    if (!Number.isInteger(c) || c <= 0) {
      setErr("Η χωρητικότητα πρέπει να είναι θετικός ακέραιος.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await onSubmit({ number: n, shape, capacity: c });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Σφάλμα αποθήκευσης.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Προσθήκη Τραπεζιού" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Αριθμός" required>
            <input
              type="number"
              min={1}
              required
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Χωρητικότητα" required>
            <input
              type="number"
              min={1}
              required
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
        <Field label="Σχήμα">
          <div className="flex gap-2">
            <ShapeOption
              current={shape}
              value="round"
              label="Στρογγυλό"
              onSelect={setShape}
            />
            <ShapeOption
              current={shape}
              value="square"
              label="Τετράγωνο"
              onSelect={setShape}
            />
          </div>
        </Field>
        {err && (
          <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
            {err}
          </div>
        )}
        <ModalFooter
          onCancel={onClose}
          submitting={saving}
          submitLabel="Προσθήκη"
        />
      </form>
    </Modal>
  );
}

function ShapeOption({
  current,
  value,
  label,
  onSelect,
}: {
  current: TableShape;
  value: TableShape;
  label: string;
  onSelect: (v: TableShape) => void;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={
        "flex-1 rounded-lg border px-3 py-2 text-sm transition " +
        (active
          ? "border-accent bg-accent/10 text-accent"
          : "border-border hover:bg-background")
      }
    >
      {label}
    </button>
  );
}

function BatchTablesModal({
  existingNumbers,
  onClose,
  onSubmit,
}: {
  existingNumbers: number[];
  onClose: () => void;
  onSubmit: (input: {
    from: number;
    to: number;
    capacity: number;
  }) => Promise<void>;
}) {
  const startFrom =
    existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
  const [count, setCount] = useState("10");
  const [capacity, setCapacity] = useState("10");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const countNum = Number(count);
  const capNum = Number(capacity);
  const countValid = Number.isInteger(countNum) && countNum > 0;
  const capValid =
    Number.isInteger(capNum) && capNum >= 1 && capNum <= 30;
  const fromNum = startFrom;
  const toNum = countValid ? startFrom + countNum - 1 : startFrom;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!countValid) {
      setErr("Το πλήθος τραπεζιών πρέπει να είναι θετικός ακέραιος.");
      return;
    }
    if (!capValid) {
      setErr("Οι θέσεις πρέπει να είναι ακέραιος μεταξύ 1 και 30.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await onSubmit({ from: fromNum, to: toNum, capacity: capNum });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Σφάλμα αποθήκευσης.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Μαζική Δημιουργία Τραπεζιών" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Πόσα τραπέζια;" required>
            <input
              type="number"
              min={1}
              required
              value={count}
              onChange={(e) => setCount(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Θέσεις ανά τραπέζι" required>
            <input
              type="number"
              min={1}
              max={30}
              required
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
        {countValid && capValid && (
          <p className="text-xs text-muted">
            Θα δημιουργηθούν τραπέζια{" "}
            <span className="font-medium">Νο {fromNum}</span> έως{" "}
            <span className="font-medium">Νο {toNum}</span> ({countNum}{" "}
            τραπέζια × {capNum} θέσεις)
          </p>
        )}
        {err && (
          <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
            {err}
          </div>
        )}
        <ModalFooter
          onCancel={onClose}
          submitting={saving}
          submitLabel="Δημιουργία"
        />
      </form>
    </Modal>
  );
}

function AddReservationModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (input: {
    group_name: string;
    pax_count: number;
    is_paid: boolean;
  }) => Promise<void>;
}) {
  const [groupName, setGroupName] = useState("");
  const [pax, setPax] = useState("4");
  const [paid, setPaid] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const g = groupName.trim();
    const p = Number(pax);
    if (!g) {
      setErr("Το όνομα παρέας είναι υποχρεωτικό.");
      return;
    }
    if (!Number.isInteger(p) || p <= 0) {
      setErr("Τα άτομα πρέπει να είναι θετικός ακέραιος.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await onSubmit({ group_name: g, pax_count: p, is_paid: paid });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Σφάλμα αποθήκευσης.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Νέα Παρέα" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Όνομα παρέας" required>
          <input
            type="text"
            required
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="π.χ. Παρέα Κώστα"
            className={inputClass}
          />
        </Field>
        <Field label="Αριθμός ατόμων" required>
          <input
            type="number"
            min={1}
            required
            value={pax}
            onChange={(e) => setPax(e.target.value)}
            className={inputClass}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={paid}
            onChange={(e) => setPaid(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Η παρέα έχει πληρώσει
        </label>
        {err && (
          <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
            {err}
          </div>
        )}
        <ModalFooter
          onCancel={onClose}
          submitting={saving}
          submitLabel="Προσθήκη"
        />
      </form>
    </Modal>
  );
}

function AddEventModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (input: {
    event_name: string;
    event_date: string;
  }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) {
      setErr("Το όνομα εκδήλωσης είναι υποχρεωτικό.");
      return;
    }
    if (!date) {
      setErr("Η ημερομηνία είναι υποχρεωτική.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await onSubmit({ event_name: name.trim(), event_date: date });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Σφάλμα αποθήκευσης.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Νέα Εκδήλωση" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Όνομα εκδήλωσης" required>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="π.χ. Ετήσιος Χορός 2026"
            className={inputClass}
          />
        </Field>
        <Field label="Ημερομηνία" required>
          <input
            type="date"
            lang="el"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass}
          />
        </Field>
        {err && (
          <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
            {err}
          </div>
        )}
        <ModalFooter
          onCancel={onClose}
          submitting={saving}
          submitLabel="Δημιουργία"
        />
      </form>
    </Modal>
  );
}

function GuestsPanel({
  reservation,
  tableCapacity,
  members,
  onClose,
  onChange,
}: {
  reservation: ReservationWithAttendees;
  tableCapacity: number | null;
  members: Member[];
  onClose: () => void;
  onChange: (guests: Guest[]) => void | Promise<void>;
}) {
  const guests = useMemo(
    () => reservation.guests ?? [],
    [reservation.guests]
  );
  const capacity = tableCapacity ?? reservation.pax_count;

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [guestName, setGuestName] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const takenMemberIds = useMemo(
    () =>
      new Set(
        guests
          .map((g) => g.member_id)
          .filter((id): id is string => typeof id === "string")
      ),
    [guests]
  );

  const matches = useMemo(() => {
    const q = debounced.toLowerCase();
    if (!q) return [] as Member[];
    return members
      .filter((m) => !takenMemberIds.has(m.id))
      .filter((m) =>
        `${m.last_name} ${m.first_name}`.toLowerCase().includes(q) ||
        `${m.first_name} ${m.last_name}`.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [members, takenMemberIds, debounced]);

  function addMember(m: Member) {
    const name = `${m.last_name} ${m.first_name}`.trim();
    onChange([...guests, { name, member_id: m.id }]);
    setSearch("");
    setDebounced("");
  }

  function addGuest() {
    const name = guestName.trim();
    if (!name) return;
    onChange([...guests, { name }]);
    setGuestName("");
  }

  function removeAt(index: number) {
    onChange(guests.filter((_, i) => i !== index));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <aside
        className="flex h-full w-full max-w-md flex-col border-l border-border bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-border p-5">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted">
              Καλεσμένοι
            </p>
            <h2 className="mt-1 text-lg font-semibold">
              {reservation.group_name}
            </h2>
            <p className="mt-1 text-xs text-muted">
              {reservation.table_number != null
                ? `Τραπέζι Νο ${reservation.table_number} · `
                : ""}
              {guests.length} / {capacity} θέσεις
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Κλείσιμο"
            className="rounded-md border border-border px-2 py-1 text-xs transition hover:bg-background"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          {guests.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted">
              Δεν έχουν προστεθεί καλεσμένοι ακόμη.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {guests.map((g, i) => (
                <li
                  key={`${g.member_id ?? "guest"}-${i}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium">{g.name}</span>
                    <span
                      className={
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium " +
                        (g.member_id
                          ? "bg-accent/10 text-accent"
                          : "bg-amber-500/10 text-amber-600 dark:text-amber-400")
                      }
                    >
                      {g.member_id ? "Μέλος" : "Επισκέπτης"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeAt(i)}
                    aria-label={`Αφαίρεση ${g.name}`}
                    className="rounded-md border border-border px-2 py-1 text-xs text-muted transition hover:border-danger/50 hover:text-danger"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-4 border-t border-border p-5">
          <div className="relative">
            <label className="mb-1 block text-xs font-medium text-muted">
              Προσθήκη από Μητρώο
            </label>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Αναζήτηση μέλους…"
              className={inputClass}
            />
            {debounced && matches.length > 0 && (
              <ul className="absolute left-0 right-0 z-10 mt-1 max-h-60 overflow-y-auto rounded-lg border border-border bg-surface shadow-lg">
                {matches.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => addMember(m)}
                      className="block w-full px-3 py-2 text-left text-sm transition hover:bg-background"
                    >
                      <span className="font-medium">
                        {m.last_name} {m.first_name}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {debounced && matches.length === 0 && (
              <p className="mt-1 text-xs text-muted">
                Δεν βρέθηκαν μέλη.
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted">
              Όνομα επισκέπτη
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addGuest();
                  }
                }}
                placeholder="π.χ. Νίκος Παπαδόπουλος"
                className={inputClass}
              />
              <button
                type="button"
                onClick={addGuest}
                disabled={!guestName.trim()}
                className="shrink-0 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              >
                +
              </button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>
      {children}
    </label>
  );
}

function ModalFooter({
  onCancel,
  submitting,
  submitLabel,
}: {
  onCancel: () => void;
  submitting: boolean;
  submitLabel: string;
}) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button
        type="button"
        onClick={onCancel}
        disabled={submitting}
        className="rounded-lg border border-border px-4 py-2 text-sm transition hover:bg-background disabled:opacity-50"
      >
        Ακύρωση
      </button>
      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? "Αποθήκευση…" : submitLabel}
      </button>
    </div>
  );
}
