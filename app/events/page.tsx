"use client";

import Link from "next/link";
import {
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
import {
  createEntertainer,
  getEntertainers,
  getEventEntertainers,
  setEventEntertainers as saveEventEntertainers,
  type EntertainerWithType,
} from "@/lib/entertainers";
import type {
  ContributionType,
  EntertainmentType,
  Event as EventRow,
  EventInsert,
  EventSponsor,
  EventSponsorInsert,
  EventTicketPrice,
  EventTicketPriceInsert,
  EventUpdate,
  Member,
  Sponsor,
  SponsorInsert,
} from "@/lib/supabase/types";

type EventListItem = EventRow & {
  event_entertainers?: Array<{
    entertainers: { id: string; name: string } | null;
  }> | null;
};

type EventEntertainerSummary = {
  id: string;
  name: string;
};

type EventWithStats = EventListItem & {
  reservation_count: number;
  table_count: number;
  entertainers_summary: EventEntertainerSummary[];
};

type DetailsForm = {
  event_name: string;
  event_date: string;
  location: string;
};

type EntertainerRow = {
  id?: string;
  entertainer_id: string;
  fee: string;
  notes: string;
};

type TicketRow = {
  id?: string;
  label: string;
  price: string;
};

type SponsorshipRow = {
  id?: string;
  sponsor_id: string;
  display_name: string;
  is_member: boolean;
  contribution_type: ContributionType;
  contribution_value: string;
  contribution_description: string;
};

const CONTRIBUTION_OPTIONS: Array<{ value: ContributionType; label: string }> = [
  { value: "money", label: "Χρήματα" },
  { value: "product", label: "Προϊόν" },
  { value: "service", label: "Υπηρεσία" },
  { value: "venue", label: "Χώρος" },
  { value: "other", label: "Άλλο" },
];

const CONTRIBUTION_LABEL: Record<ContributionType, string> =
  Object.fromEntries(
    CONTRIBUTION_OPTIONS.map((o) => [o.value, o.label])
  ) as Record<ContributionType, string>;

const eur = new Intl.NumberFormat("el-GR", {
  style: "currency",
  currency: "EUR",
});

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

function countTables(raw: unknown): number {
  if (!raw || typeof raw !== "object") return 0;
  const list = (raw as { tables?: unknown }).tables;
  return Array.isArray(list) ? list.length : 0;
}

function entertainersBadge(list: EventEntertainerSummary[]): string {
  if (list.length === 0) return "";
  if (list.length === 1) return list[0].name;
  return `${list[0].name} +${list.length - 1}`;
}

function memberDisplayName(m: Member): string {
  return `${m.last_name} ${m.first_name}`.trim();
}

function sponsorDisplayName(
  s: Sponsor,
  memberLookup: Map<string, Member>
): string {
  if (s.member_id) {
    const m = memberLookup.get(s.member_id);
    if (m) return memberDisplayName(m);
  }
  return s.external_name ?? "—";
}

export default function EventsPage() {
  const role = useRole();
  const { clubId, loading: clubLoading } = useCurrentClub();
  const [events, setEvents] = useState<EventWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<EventRow | null>(null);

  const loadEvents = useCallback(async () => {
    if (!clubId) return;
    try {
      const supabase = getBrowserClient();
      const { data, error: qErr } = await supabase
        .from("events")
        .select("*, event_entertainers(entertainers(id, name))")
        .eq("club_id", clubId)
        .order("event_date", { ascending: false });
      if (qErr) throw qErr;
      const rows = (data ?? []) as unknown as EventListItem[];
      const ids = rows.map((e) => e.id);
      const counts = new Map<string, number>();
      if (ids.length > 0) {
        const { data: resData, error: rErr } = await supabase
          .from("reservations")
          .select("event_id")
          .in("event_id", ids);
        if (rErr) throw rErr;
        for (const r of resData ?? []) {
          counts.set(r.event_id, (counts.get(r.event_id) ?? 0) + 1);
        }
      }
      setError(null);
      setEvents(
        rows.map((e) => {
          const summary: EventEntertainerSummary[] = (
            e.event_entertainers ?? []
          )
            .map((ee) => ee.entertainers)
            .filter((x): x is { id: string; name: string } => !!x)
            .map((x) => ({ id: x.id, name: x.name }));
          return {
            ...e,
            reservation_count: counts.get(e.id) ?? 0,
            table_count: countTables(e.venue_map_config),
            entertainers_summary: summary,
          };
        })
      );
    } catch (err) {
      setError(errorMessage(err, "Σφάλμα φόρτωσης εκδηλώσεων."));
    } finally {
      setLoading(false);
    }
  }, [clubId]);

  useEffect(() => {
    if (clubLoading) return;
    loadEvents();
  }, [loadEvents, clubLoading]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return events;
    return events.filter((e) => e.event_name.toLowerCase().includes(q));
  }, [events, search]);

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }
  function openEdit(ev: EventRow) {
    setEditing(ev);
    setModalOpen(true);
  }
  function closeModal() {
    setModalOpen(false);
    setEditing(null);
  }

  async function handleDelete(ev: EventWithStats) {
    const warn =
      ev.reservation_count > 0
        ? `Η εκδήλωση «${ev.event_name}» έχει ${ev.reservation_count} κρατήσεις που θα διαγραφούν επίσης. `
        : `Διαγραφή της εκδήλωσης «${ev.event_name}»; `;
    if (!window.confirm(warn + "Η ενέργεια δεν αναιρείται.")) return;
    try {
      const supabase = getBrowserClient();
      if (ev.reservation_count > 0) {
        const { error: rErr } = await supabase
          .from("reservations")
          .delete()
          .eq("event_id", ev.id);
        if (rErr) throw rErr;
      }
      const { error: dErr } = await supabase
        .from("events")
        .delete()
        .eq("id", ev.id);
      if (dErr) throw dErr;
      await loadEvents();
    } catch (err) {
      setError(errorMessage(err, "Σφάλμα διαγραφής εκδήλωσης."));
    }
  }

  if (role.loading) {
    return (
      <div className="mx-auto w-full max-w-6xl p-10 text-center text-muted">
        Φόρτωση…
      </div>
    );
  }
  if (role.userId && !role.permissions.includes("events")) {
    return <AccessDenied />;
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">Εκδηλώσεις</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Διαχείριση Εκδηλώσεων
          </h1>
          <p className="mt-1 text-sm text-muted">
            Δημιουργήστε εκδηλώσεις, ορίστε τιμές πρόσκλησης και χορηγούς.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90"
        >
          + Νέα Εκδήλωση
        </button>
      </header>

      <div className="mb-4">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Αναζήτηση…"
          className="w-full rounded-lg border border-border bg-surface px-4 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
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

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-background/50 text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-3">Όνομα</th>
                <th className="px-4 py-3">Ημερομηνία</th>
                <th className="px-4 py-3">Τραπέζια</th>
                <th className="px-4 py-3">Κρατήσεις</th>
                <th className="px-4 py-3 text-right">Ενέργειες</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted">
                    Φόρτωση…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted">
                    {events.length === 0
                      ? "Δεν υπάρχουν ακόμη εκδηλώσεις."
                      : "Δεν βρέθηκαν αποτελέσματα."}
                  </td>
                </tr>
              ) : (
                filtered.map((ev) => (
                  <tr key={ev.id} className="hover:bg-background/40">
                    <td className="px-4 py-3">
                      <div className="font-medium">{ev.event_name}</div>
                      {(ev.location ||
                        ev.entertainers_summary.length > 0) && (
                        <div className="mt-0.5 text-xs text-muted">
                          {[
                            ev.location ? `📍 ${ev.location}` : null,
                            ev.entertainers_summary.length > 0
                              ? `🎵 ${entertainersBadge(ev.entertainers_summary)}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {new Date(ev.event_date).toLocaleDateString("el-GR")}
                    </td>
                    <td className="px-4 py-3 text-muted">{ev.table_count}</td>
                    <td className="px-4 py-3 text-muted">
                      {ev.reservation_count}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex flex-wrap justify-end gap-2">
                        <Link
                          href={`/events/summary/${ev.id}`}
                          className="rounded-md border border-border px-3 py-1 text-xs transition hover:bg-background"
                        >
                          Σύνοψη →
                        </Link>
                        <Link
                          href={`/seating?event=${ev.id}`}
                          className="rounded-md border border-border px-3 py-1 text-xs transition hover:bg-background"
                        >
                          Πλάνο →
                        </Link>
                        <button
                          type="button"
                          onClick={() => openEdit(ev)}
                          className="rounded-md border border-border px-3 py-1 text-xs transition hover:bg-background"
                        >
                          Επεξεργασία
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(ev)}
                          className="rounded-md border border-danger/30 px-3 py-1 text-xs text-danger transition hover:bg-danger/10"
                        >
                          Διαγραφή
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <EventModal
          editing={editing}
          clubId={clubId}
          onClose={closeModal}
          onSaved={async () => {
            closeModal();
            await loadEvents();
          }}
        />
      )}
    </div>
  );
}

type Tab = "details" | "tickets" | "entertainment" | "sponsors";

function EventModal({
  editing,
  clubId,
  onClose,
  onSaved,
}: {
  editing: EventRow | null;
  clubId: string | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [tab, setTab] = useState<Tab>("details");
  const [details, setDetails] = useState<DetailsForm>(() =>
    editing
      ? {
          event_name: editing.event_name,
          event_date: editing.event_date.slice(0, 10),
          location: editing.location ?? "",
        }
      : {
          event_name: "",
          event_date: new Date().toISOString().slice(0, 10),
          location: "",
        }
  );
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [sponsorships, setSponsorships] = useState<SponsorshipRow[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [entertainmentTypes, setEntertainmentTypes] = useState<
    EntertainmentType[]
  >([]);
  const [entertainers, setEntertainers] = useState<EntertainerWithType[]>([]);
  const [eventEntertainers, setEventEntertainers] = useState<
    EntertainerRow[]
  >([]);
  const [creatingEntertainer, setCreatingEntertainer] = useState(false);
  const memberLookup = useMemo(() => {
    const m = new Map<string, Member>();
    for (const x of members) m.set(x.id, x);
    return m;
  }, [members]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingSponsor, setEditingSponsor] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = getBrowserClient();
        const etQuery = clubId
          ? supabase
              .from("entertainment_types")
              .select("*")
              .eq("club_id", clubId)
              .eq("active", true)
              .order("display_order", { ascending: true })
          : Promise.resolve({ data: [], error: null } as const);
        const entListPromise = clubId
          ? getEntertainers(clubId)
          : Promise.resolve([] as EntertainerWithType[]);
        const eventEntPromise = editing
          ? getEventEntertainers(editing.id)
          : Promise.resolve([]);
        const [mRes, tRes, spRes, etRes, entList, eventEntList] =
          await Promise.all([
            supabase
              .from("members")
              .select("*")
              .eq("status", "active")
              .order("last_name", { ascending: true }),
            editing
              ? supabase
                  .from("event_ticket_prices")
                  .select("*")
                  .eq("event_id", editing.id)
                  .order("display_order", { ascending: true })
              : Promise.resolve({ data: [], error: null } as const),
            editing
              ? supabase
                  .from("event_sponsors")
                  .select("*, sponsors(id, member_id, external_name)")
                  .eq("event_id", editing.id)
              : Promise.resolve({ data: [], error: null } as const),
            etQuery,
            entListPromise,
            eventEntPromise,
          ]);
        if (cancelled) return;
        if (mRes.error) throw mRes.error;
        if (tRes.error) throw tRes.error;
        if (spRes.error) throw spRes.error;
        if (etRes.error) throw etRes.error;

        const memberRows = (mRes.data ?? []) as Member[];
        setMembers(memberRows);
        setEntertainmentTypes(
          (etRes.data ?? []) as EntertainmentType[]
        );
        setEntertainers(entList);
        setEventEntertainers(
          eventEntList.map((row) => ({
            id: row.id,
            entertainer_id: row.entertainer_id,
            fee: row.fee != null ? String(row.fee) : "",
            notes: row.notes ?? "",
          }))
        );

        const ticketRows = (tRes.data ?? []) as EventTicketPrice[];
        setTickets(
          ticketRows.map((t) => ({
            id: t.id,
            label: t.label,
            price: String(t.price),
          }))
        );

        const lookup = new Map<string, Member>();
        for (const x of memberRows) lookup.set(x.id, x);
        const spRows = (spRes.data ?? []) as Array<
          EventSponsor & {
            sponsors?: {
              id: string;
              member_id: string | null;
              external_name: string | null;
            } | null;
          }
        >;
        setSponsorships(
          spRows.map((row) => {
            const sp = row.sponsors;
            const isMember = !!sp?.member_id;
            const name = isMember
              ? lookup.get(sp!.member_id!)
                ? memberDisplayName(lookup.get(sp!.member_id!)!)
                : "—"
              : (sp?.external_name ?? "—");
            return {
              id: row.id,
              sponsor_id: row.sponsor_id,
              display_name: name,
              is_member: isMember,
              contribution_type: row.contribution_type,
              contribution_value:
                row.contribution_value != null
                  ? String(row.contribution_value)
                  : "",
              contribution_description: row.contribution_description ?? "",
            };
          })
        );
      } catch (err) {
        if (!cancelled)
          setFormError(errorMessage(err, "Σφάλμα φόρτωσης δεδομένων."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editing, clubId]);

  function addTicket() {
    setTickets((s) => [...s, { label: "", price: "" }]);
  }
  function removeTicket(i: number) {
    setTickets((s) => s.filter((_, idx) => idx !== i));
  }
  function moveTicket(i: number, dir: -1 | 1) {
    setTickets((s) => {
      const j = i + dir;
      if (j < 0 || j >= s.length) return s;
      const next = [...s];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function updateTicket(i: number, patch: Partial<TicketRow>) {
    setTickets((s) => s.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function addSponsorship(row: SponsorshipRow) {
    setSponsorships((s) => [...s, row]);
  }
  function updateSponsorship(i: number, patch: Partial<SponsorshipRow>) {
    setSponsorships((s) =>
      s.map((row, idx) => (idx === i ? { ...row, ...patch } : row))
    );
  }
  function removeSponsorship(i: number) {
    setSponsorships((s) => s.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);

    const event_name = details.event_name.trim();
    const event_date = details.event_date;
    if (!event_name) {
      setTab("details");
      setFormError("Το όνομα εκδήλωσης είναι υποχρεωτικό.");
      return;
    }
    if (!event_date) {
      setTab("details");
      setFormError("Η ημερομηνία είναι υποχρεωτική.");
      return;
    }

    const cleanTickets: Array<EventTicketPriceInsert> = [];
    for (let i = 0; i < tickets.length; i++) {
      const t = tickets[i];
      const cat = t.label.trim();
      const priceNum = Number(t.price.replace(",", "."));
      if (!cat) {
        setTab("tickets");
        setFormError(`Η κατηγορία στη γραμμή ${i + 1} είναι υποχρεωτική.`);
        return;
      }
      if (!Number.isFinite(priceNum) || priceNum < 0) {
        setTab("tickets");
        setFormError(`Η τιμή στη γραμμή ${i + 1} δεν είναι έγκυρη.`);
        return;
      }
      cleanTickets.push({
        event_id: "",
        label: cat,
        price: priceNum,
        display_order: i,
      });
    }

    if (!clubId) {
      setFormError("Δεν έχει εντοπιστεί σύλλογος. Συνδεθείτε ξανά.");
      return;
    }

    const cleanEntertainers: Array<{
      entertainer_id: string;
      fee: number | null;
      notes: string | null;
    }> = [];
    const seenEntertainers = new Set<string>();
    for (let i = 0; i < eventEntertainers.length; i++) {
      const row = eventEntertainers[i];
      if (!row.entertainer_id) {
        setTab("entertainment");
        setFormError(`Επιλέξτε ψυχαγωγό στη γραμμή ${i + 1}.`);
        return;
      }
      if (seenEntertainers.has(row.entertainer_id)) {
        setTab("entertainment");
        setFormError(
          `Ο ψυχαγωγός στη γραμμή ${i + 1} έχει ήδη προστεθεί.`
        );
        return;
      }
      seenEntertainers.add(row.entertainer_id);
      let feeNum: number | null = null;
      const trimmed = row.fee.trim();
      if (trimmed) {
        feeNum = Number(trimmed.replace(",", "."));
        if (!Number.isFinite(feeNum) || feeNum < 0) {
          setTab("entertainment");
          setFormError(
            `Η αμοιβή στη γραμμή ${i + 1} δεν είναι έγκυρη.`
          );
          return;
        }
      }
      cleanEntertainers.push({
        entertainer_id: row.entertainer_id,
        fee: feeNum,
        notes: row.notes.trim() || null,
      });
    }

    setSaving(true);
    try {
      const supabase = getBrowserClient();
      const eventPayload = {
        event_name,
        event_date,
        location: details.location.trim() || null,
      };

      let eventId: string;
      if (editing) {
        const update: EventUpdate = eventPayload;
        const { error: uErr } = await supabase
          .from("events")
          .update(update)
          .eq("id", editing.id)
          .eq("club_id", clubId);
        if (uErr) throw uErr;
        eventId = editing.id;
      } else {
        const insert: EventInsert = {
          ...eventPayload,
          club_id: clubId,
          venue_map_config: { tables: [] },
        };
        const { data: ins, error: iErr } = await supabase
          .from("events")
          .insert(insert)
          .select("id")
          .single();
        if (iErr) throw iErr;
        eventId = (ins as { id: string }).id;
      }

      // Sync ticket prices: replace-all
      const { error: dtErr } = await supabase
        .from("event_ticket_prices")
        .delete()
        .eq("event_id", eventId);
      if (dtErr) throw dtErr;
      if (cleanTickets.length > 0) {
        const rows = cleanTickets.map((t) => ({
          ...t,
          event_id: eventId,
          club_id: clubId,
        }));
        const { error: itErr } = await supabase
          .from("event_ticket_prices")
          .insert(rows);
        if (itErr) throw itErr;
      }

      // Sync event_sponsors: replace-all
      const { error: dsErr } = await supabase
        .from("event_sponsors")
        .delete()
        .eq("event_id", eventId);
      if (dsErr) throw dsErr;
      if (sponsorships.length > 0) {
        const rows: EventSponsorInsert[] = sponsorships.map((s) => ({
          event_id: eventId,
          club_id: clubId,
          sponsor_id: s.sponsor_id,
          contribution_type: s.contribution_type,
          contribution_value: s.contribution_value
            ? Number(s.contribution_value.replace(",", "."))
            : null,
          contribution_description: s.contribution_description.trim() || null,
        }));
        const { error: isErr } = await supabase
          .from("event_sponsors")
          .insert(rows);
        if (isErr) throw isErr;
      }

      // Sync event_entertainers: replace-all
      await saveEventEntertainers(eventId, clubId, cleanEntertainers);

      await onSaved();
    } catch (err) {
      setFormError(errorMessage(err, "Σφάλμα αποθήκευσης."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border p-6">
          <h2 className="text-lg font-semibold">
            {editing ? "Επεξεργασία Εκδήλωσης" : "Νέα Εκδήλωση"}
          </h2>
          <div className="mt-3 inline-flex rounded-lg border border-border bg-background p-0.5 text-xs">
            <TabBtn current={tab} value="details" onSelect={setTab}>
              Λεπτομέρειες
            </TabBtn>
            <TabBtn current={tab} value="tickets" onSelect={setTab}>
              Τιμές
            </TabBtn>
            <TabBtn current={tab} value="entertainment" onSelect={setTab}>
              Ψυχαγωγία
            </TabBtn>
            <TabBtn current={tab} value="sponsors" onSelect={setTab}>
              Χορηγοί
            </TabBtn>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            {loading ? (
              <p className="py-10 text-center text-sm text-muted">Φόρτωση…</p>
            ) : tab === "details" ? (
              <DetailsTab form={details} setForm={setDetails} />
            ) : tab === "tickets" ? (
              <TicketsTab
                tickets={tickets}
                onAdd={addTicket}
                onRemove={removeTicket}
                onMove={moveTicket}
                onUpdate={updateTicket}
              />
            ) : tab === "entertainment" ? (
              <EntertainmentTab
                rows={eventEntertainers}
                setRows={setEventEntertainers}
                entertainers={entertainers}
                entertainmentTypes={entertainmentTypes}
                clubId={clubId}
                onCreated={(ent) => {
                  setEntertainers((s) => {
                    const next = [...s, ent];
                    next.sort((a, b) => a.name.localeCompare(b.name, "el"));
                    return next;
                  });
                  setEventEntertainers((s) => [
                    ...s,
                    { entertainer_id: ent.id, fee: "", notes: "" },
                  ]);
                }}
                creating={creatingEntertainer}
                setCreating={setCreatingEntertainer}
              />
            ) : (
              <SponsorsTab
                sponsorships={sponsorships}
                editingIndex={editingSponsor}
                setEditingIndex={setEditingSponsor}
                onAdd={() => setPickerOpen(true)}
                onRemove={removeSponsorship}
                onUpdate={updateSponsorship}
              />
            )}

            {formError && (
              <div className="mt-4 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
                {formError}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-border p-4">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-border px-4 py-2 text-sm transition hover:bg-background disabled:opacity-50"
            >
              Ακύρωση
            </button>
            <button
              type="submit"
              disabled={saving || loading}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {saving
                ? "Αποθήκευση…"
                : editing
                  ? "Αποθήκευση Αλλαγών"
                  : "Δημιουργία"}
            </button>
          </div>
        </form>
      </div>

      {pickerOpen && (
        <SponsorPicker
          members={members}
          memberLookup={memberLookup}
          clubId={clubId}
          onClose={() => setPickerOpen(false)}
          onPick={(row) => {
            addSponsorship(row);
            setPickerOpen(false);
          }}
        />
      )}
    </div>
  );
}

function TabBtn({
  current,
  value,
  onSelect,
  children,
}: {
  current: Tab;
  value: Tab;
  onSelect: (v: Tab) => void;
  children: ReactNode;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={
        "rounded-md px-3 py-1 transition " +
        (active
          ? "bg-accent text-white"
          : "text-muted hover:text-foreground")
      }
    >
      {children}
    </button>
  );
}

function DetailsTab({
  form,
  setForm,
}: {
  form: DetailsForm;
  setForm: React.Dispatch<React.SetStateAction<DetailsForm>>;
}) {
  return (
    <div className="space-y-4">
      <Field label="Όνομα εκδήλωσης" required>
        <input
          type="text"
          required
          value={form.event_name}
          onChange={(e) =>
            setForm((s) => ({ ...s, event_name: e.target.value }))
          }
          placeholder="π.χ. Ετήσιος Χορός 2026"
          className={inputClass}
        />
      </Field>
      <Field label="Ημερομηνία" required>
        <input
          type="date"
          lang="el"
          required
          value={form.event_date}
          onChange={(e) =>
            setForm((s) => ({ ...s, event_date: e.target.value }))
          }
          className={inputClass}
        />
      </Field>
      <Field label="Τοποθεσία">
        <input
          type="text"
          value={form.location}
          onChange={(e) =>
            setForm((s) => ({ ...s, location: e.target.value }))
          }
          placeholder="π.χ. Αίθουσα Συλλόγου, Λάρισα"
          className={inputClass}
        />
      </Field>
    </div>
  );
}

function EntertainmentTab({
  rows,
  setRows,
  entertainers,
  entertainmentTypes,
  clubId,
  onCreated,
  creating,
  setCreating,
}: {
  rows: EntertainerRow[];
  setRows: React.Dispatch<React.SetStateAction<EntertainerRow[]>>;
  entertainers: EntertainerWithType[];
  entertainmentTypes: EntertainmentType[];
  clubId: string | null;
  onCreated: (ent: EntertainerWithType) => void;
  creating: boolean;
  setCreating: (v: boolean) => void;
}) {
  const lookup = useMemo(() => {
    const m = new Map<string, EntertainerWithType>();
    for (const e of entertainers) m.set(e.id, e);
    return m;
  }, [entertainers]);

  const usedIds = new Set(rows.map((r) => r.entertainer_id).filter(Boolean));
  const available = entertainers.filter((e) => !usedIds.has(e.id));

  function addEmpty() {
    setRows((s) => [...s, { entertainer_id: "", fee: "", notes: "" }]);
  }
  function update(i: number, patch: Partial<EntertainerRow>) {
    setRows((s) => s.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function remove(i: number) {
    setRows((s) => s.filter((_, idx) => idx !== i));
  }

  const total = rows.reduce((sum, r) => {
    const n = Number(r.fee.replace(",", "."));
    return Number.isFinite(n) ? sum + n : sum;
  }, 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">
          Επιλέξτε υπάρχοντες ψυχαγωγούς ή προσθέστε νέους με αμοιβή ανά
          εκδήλωση.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition hover:bg-foreground/5"
          >
            + Νέος ψυχαγωγός
          </button>
        </div>
      </div>

      {entertainers.length === 0 && rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted">
          Δεν έχουν οριστεί ψυχαγωγοί. Πατήστε «Νέος ψυχαγωγός».
        </p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted">
          Δεν έχει οριστεί ψυχαγωγία για αυτήν την εκδήλωση.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r, i) => {
            const ent = r.entertainer_id ? lookup.get(r.entertainer_id) : null;
            const typeName = ent?.entertainment_type?.name ?? null;
            return (
              <li
                key={i}
                className="rounded-lg border border-border bg-background p-3"
              >
                <div className="grid gap-2 sm:grid-cols-[1.5fr_120px_1fr_auto]">
                  <Field label="Ψυχαγωγός">
                    <select
                      value={r.entertainer_id}
                      onChange={(e) =>
                        update(i, { entertainer_id: e.target.value })
                      }
                      className={inputClass}
                    >
                      <option value="">— Επιλέξτε —</option>
                      {ent && (
                        <option key={ent.id} value={ent.id}>
                          {ent.name}
                          {typeName ? ` (${typeName})` : ""}
                        </option>
                      )}
                      {available.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                          {a.entertainment_type
                            ? ` (${a.entertainment_type.name})`
                            : ""}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Αμοιβή (€)">
                    <input
                      type="number"
                      step="0.01"
                      inputMode="decimal"
                      value={r.fee}
                      onChange={(e) => update(i, { fee: e.target.value })}
                      placeholder="—"
                      className={inputClass + " text-right"}
                    />
                  </Field>
                  <Field label="Σημειώσεις">
                    <input
                      type="text"
                      value={r.notes}
                      onChange={(e) => update(i, { notes: e.target.value })}
                      placeholder="προαιρετικό"
                      className={inputClass}
                    />
                  </Field>
                  <div className="flex items-end pb-1">
                    <button
                      type="button"
                      onClick={() => remove(i)}
                      aria-label="Αφαίρεση"
                      className="rounded-md border border-danger/30 px-2 py-1 text-[12px] text-danger transition hover:bg-danger/10"
                    >
                      ❌
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={addEmpty}
          disabled={available.length === 0 && entertainers.length > 0}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition hover:bg-foreground/5 disabled:opacity-50"
        >
          + Προσθήκη ψυχαγωγού
        </button>
        {rows.length > 0 && (
          <div className="text-sm">
            <span className="text-muted">Σύνολο αμοιβών: </span>
            <span className="font-semibold">{eur.format(total)}</span>
          </div>
        )}
      </div>

      {creating && (
        <NewEntertainerDialog
          clubId={clubId}
          entertainmentTypes={entertainmentTypes}
          onClose={() => setCreating(false)}
          onCreated={(ent) => {
            setCreating(false);
            onCreated(ent);
          }}
        />
      )}
    </div>
  );
}

function NewEntertainerDialog({
  clubId,
  entertainmentTypes,
  onClose,
  onCreated,
}: {
  clubId: string | null;
  entertainmentTypes: EntertainmentType[];
  onClose: () => void;
  onCreated: (ent: EntertainerWithType) => void;
}) {
  const [name, setName] = useState("");
  const [typeId, setTypeId] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    if (!clubId) {
      setErr("Δεν έχει εντοπιστεί σύλλογος.");
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      setErr("Το όνομα είναι υποχρεωτικό.");
      return;
    }
    setSaving(true);
    try {
      const created = await createEntertainer(clubId, {
        name: trimmed,
        entertainment_type_id: typeId || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        notes: notes.trim() || null,
      });
      const type =
        entertainmentTypes.find((t) => t.id === typeId) ?? null;
      onCreated({ ...created, entertainment_type: type });
    } catch (e) {
      setErr(errorMessage(e, "Σφάλμα δημιουργίας ψυχαγωγού."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-base font-semibold">Νέος ψυχαγωγός</h3>
        <div className="space-y-3">
          <Field label="Όνομα" required>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="π.χ. Νίκος Παπαγρηγορίου"
              className={inputClass}
            />
          </Field>
          <Field label="Τύπος ψυχαγωγίας">
            <select
              value={typeId}
              onChange={(e) => setTypeId(e.target.value)}
              className={inputClass}
            >
              <option value="">— Χωρίς τύπο —</option>
              {entertainmentTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Τηλέφωνο">
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
          <Field label="Σημειώσεις">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className={inputClass}
            />
          </Field>
          {err && (
            <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
              {err}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-border px-4 py-2 text-sm transition hover:bg-background disabled:opacity-50"
            >
              Ακύρωση
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={saving}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Δημιουργία…" : "Δημιουργία"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TicketsTab({
  tickets,
  onAdd,
  onRemove,
  onMove,
  onUpdate,
}: {
  tickets: TicketRow[];
  onAdd: () => void;
  onRemove: (i: number) => void;
  onMove: (i: number, dir: -1 | 1) => void;
  onUpdate: (i: number, patch: Partial<TicketRow>) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Πολλαπλές κατηγορίες (π.χ. Ενήλικας, Παιδί &lt;15, Μέλος Δ.Σ.). Η σειρά
        χρησιμοποιείται στη Σύνοψη Εκδήλωσης.
      </p>
      {tickets.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted">
          Δεν έχουν οριστεί τιμές. Προσθέστε την πρώτη.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-background/50 text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-3 py-2 text-left">Κατηγορία</th>
                <th className="px-3 py-2 text-right">Τιμή €</th>
                <th className="w-20 px-3 py-2 text-center">Σειρά</th>
                <th className="w-12 px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tickets.map((t, i) => (
                <tr key={i} className="bg-background">
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={t.label}
                      onChange={(e) =>
                        onUpdate(i, { label: e.target.value })
                      }
                      placeholder="π.χ. Ενήλικας"
                      className={inputClass}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step="0.01"
                      inputMode="decimal"
                      value={t.price}
                      onChange={(e) => onUpdate(i, { price: e.target.value })}
                      placeholder="0.00"
                      className={inputClass + " text-right"}
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <div className="inline-flex flex-col gap-0.5">
                      <button
                        type="button"
                        onClick={() => onMove(i, -1)}
                        disabled={i === 0}
                        aria-label="Πάνω"
                        className="rounded border border-border px-1.5 text-[10px] disabled:opacity-30"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => onMove(i, 1)}
                        disabled={i === tickets.length - 1}
                        aria-label="Κάτω"
                        className="rounded border border-border px-1.5 text-[10px] disabled:opacity-30"
                      >
                        ↓
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => onRemove(i)}
                      aria-label="Διαγραφή"
                      className="rounded-md border border-danger/30 px-2 py-1 text-[12px] text-danger transition hover:bg-danger/10"
                    >
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <button
        type="button"
        onClick={onAdd}
        className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition hover:bg-foreground/5"
      >
        + Προσθήκη Κατηγορίας
      </button>
    </div>
  );
}

function SponsorsTab({
  sponsorships,
  editingIndex,
  setEditingIndex,
  onAdd,
  onRemove,
  onUpdate,
}: {
  sponsorships: SponsorshipRow[];
  editingIndex: number | null;
  setEditingIndex: (i: number | null) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
  onUpdate: (i: number, patch: Partial<SponsorshipRow>) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">
          Μέλη ή εξωτερικοί υποστηρικτές. Η αξία αθροίζεται στη Σύνοψη.
        </p>
        <button
          type="button"
          onClick={onAdd}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition hover:bg-foreground/5"
        >
          + Προσθήκη Χορηγού
        </button>
      </div>

      {sponsorships.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted">
          Κανένας χορηγός. Προσθέστε τον πρώτο.
        </p>
      ) : (
        <ul className="space-y-2">
          {sponsorships.map((s, i) => {
            const isEditing = editingIndex === i;
            return (
              <li
                key={i}
                className="rounded-lg border border-border bg-background p-3"
              >
                <div className="grid items-center gap-3 sm:grid-cols-[1fr_auto]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {s.display_name}
                      </span>
                      <span
                        className={
                          "rounded-full px-2 py-0.5 text-[10px] " +
                          (s.is_member
                            ? "bg-blue-500/10 text-blue-700 dark:text-blue-300"
                            : "bg-amber-500/10 text-amber-700 dark:text-amber-300")
                        }
                      >
                        {s.is_member ? "Μέλος" : "Εξωτερικός"}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      {CONTRIBUTION_LABEL[s.contribution_type]}
                      {s.contribution_value &&
                        ` · ${eur.format(Number(s.contribution_value.replace(",", ".")))}`}
                      {s.contribution_description && (
                        <span className="ml-1 truncate">
                          · {s.contribution_description}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingIndex(isEditing ? null : i)}
                      className="rounded-md border border-border px-2 py-1 text-[11px] transition hover:bg-foreground/5"
                    >
                      {isEditing ? "Κλείσιμο" : "Επεξ."}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemove(i)}
                      className="rounded-md border border-danger/30 px-2 py-1 text-[11px] text-danger transition hover:bg-danger/10"
                    >
                      Αφαίρεση
                    </button>
                  </div>
                </div>

                {isEditing && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <Field label="Είδος">
                      <select
                        value={s.contribution_type}
                        onChange={(e) =>
                          onUpdate(i, {
                            contribution_type: e.target
                              .value as ContributionType,
                          })
                        }
                        className={inputClass}
                      >
                        {CONTRIBUTION_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Αξία (€)">
                      <input
                        type="number"
                        step="0.01"
                        inputMode="decimal"
                        value={s.contribution_value}
                        onChange={(e) =>
                          onUpdate(i, { contribution_value: e.target.value })
                        }
                        placeholder="0.00"
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Περιγραφή">
                      <input
                        type="text"
                        value={s.contribution_description}
                        onChange={(e) =>
                          onUpdate(i, {
                            contribution_description: e.target.value,
                          })
                        }
                        placeholder="π.χ. 10 μπουκάλια κρασί"
                        className={inputClass}
                      />
                    </Field>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

type PickerMode = "member" | "external";

function SponsorPicker({
  members,
  memberLookup,
  clubId,
  onClose,
  onPick,
}: {
  members: Member[];
  memberLookup: Map<string, Member>;
  clubId: string | null;
  onClose: () => void;
  onPick: (row: SponsorshipRow) => void;
}) {
  const [mode, setMode] = useState<PickerMode>("member");
  const [memberId, setMemberId] = useState<string>("");
  const [memberSearch, setMemberSearch] = useState("");
  const [externalName, setExternalName] = useState("");
  const [externalPhone, setExternalPhone] = useState("");
  const [externalEmail, setExternalEmail] = useState("");
  const [contribType, setContribType] = useState<ContributionType>("money");
  const [contribValue, setContribValue] = useState("");
  const [contribDesc, setContribDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return members.slice(0, 30);
    return members
      .filter((m) =>
        `${m.last_name} ${m.first_name} ${m.email ?? ""}`
          .toLowerCase()
          .includes(q)
      )
      .slice(0, 30);
  }, [members, memberSearch]);

  async function submit() {
    setErr(null);
    if (mode === "member" && !memberId) {
      setErr("Επιλέξτε μέλος.");
      return;
    }
    if (mode === "external" && !externalName.trim()) {
      setErr("Συμπληρώστε όνομα χορηγού.");
      return;
    }

    if (!clubId) {
      setErr("Δεν έχει εντοπιστεί σύλλογος.");
      return;
    }

    setSaving(true);
    try {
      const supabase = getBrowserClient();
      let sponsor: Sponsor;

      if (mode === "member") {
        // Reuse existing sponsor row for this member if any
        const { data: existing, error: qErr } = await supabase
          .from("sponsors")
          .select("*")
          .eq("member_id", memberId)
          .eq("club_id", clubId)
          .maybeSingle();
        if (qErr) throw qErr;
        if (existing) {
          sponsor = existing as Sponsor;
        } else {
          const m = memberLookup.get(memberId);
          const insert: SponsorInsert = {
            club_id: clubId,
            member_id: memberId,
            external_name: null,
            contact_phone: m?.phone ?? null,
            contact_email: m?.email ?? null,
          };
          const { data: ins, error: iErr } = await supabase
            .from("sponsors")
            .insert(insert)
            .select("*")
            .single();
          if (iErr) throw iErr;
          sponsor = ins as Sponsor;
        }
      } else {
        const insert: SponsorInsert = {
          club_id: clubId,
          member_id: null,
          external_name: externalName.trim(),
          contact_phone: externalPhone.trim() || null,
          contact_email: externalEmail.trim() || null,
        };
        const { data: ins, error: iErr } = await supabase
          .from("sponsors")
          .insert(insert)
          .select("*")
          .single();
        if (iErr) throw iErr;
        sponsor = ins as Sponsor;
      }

      const isMember = !!sponsor.member_id;
      const display = isMember
        ? memberLookup.get(sponsor.member_id!)
          ? memberDisplayName(memberLookup.get(sponsor.member_id!)!)
          : "—"
        : (sponsor.external_name ?? "—");

      onPick({
        sponsor_id: sponsor.id,
        display_name: display,
        is_member: isMember,
        contribution_type: contribType,
        contribution_value: contribValue,
        contribution_description: contribDesc,
      });
    } catch (e) {
      setErr(errorMessage(e, "Σφάλμα δημιουργίας χορηγού."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-xl border border-border bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border p-5">
          <h3 className="text-base font-semibold">Προσθήκη Χορηγού</h3>
          <div className="mt-3 inline-flex rounded-lg border border-border bg-background p-0.5 text-xs">
            {(
              [
                { id: "member" as PickerMode, label: "Μέλος" },
                { id: "external" as PickerMode, label: "Εξωτερικός" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setMode(t.id)}
                className={
                  "rounded-md px-3 py-1 transition " +
                  (mode === t.id
                    ? "bg-accent text-white"
                    : "text-muted hover:text-foreground")
                }
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
          {mode === "member" ? (
            <>
              <input
                type="search"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Αναζήτηση μέλους…"
                className={inputClass}
              />
              <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                {filteredMembers.length === 0 ? (
                  <li className="px-3 py-3 text-center text-xs text-muted">
                    Δεν βρέθηκαν.
                  </li>
                ) : (
                  filteredMembers.map((m) => {
                    const active = memberId === m.id;
                    return (
                      <li key={m.id}>
                        <button
                          type="button"
                          onClick={() => setMemberId(m.id)}
                          className={
                            "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition " +
                            (active
                              ? "bg-accent/10 text-accent"
                              : "hover:bg-foreground/5")
                          }
                        >
                          <span className="truncate font-medium">
                            {m.last_name} {m.first_name}
                          </span>
                          {m.email && (
                            <span className="text-[10px] text-muted">
                              {m.email}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            </>
          ) : (
            <div className="space-y-3">
              <Field label="Όνομα" required>
                <input
                  type="text"
                  value={externalName}
                  onChange={(e) => setExternalName(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Τηλέφωνο">
                  <input
                    type="tel"
                    value={externalPhone}
                    onChange={(e) => setExternalPhone(e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Email">
                  <input
                    type="email"
                    value={externalEmail}
                    onChange={(e) => setExternalEmail(e.target.value)}
                    className={inputClass}
                  />
                </Field>
              </div>
            </div>
          )}

          <fieldset className="space-y-3 rounded-lg border border-border p-3">
            <legend className="px-2 text-xs font-semibold uppercase tracking-wider text-muted">
              Προσφορά
            </legend>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Είδος">
                <select
                  value={contribType}
                  onChange={(e) =>
                    setContribType(e.target.value as ContributionType)
                  }
                  className={inputClass}
                >
                  {CONTRIBUTION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Αξία (€)">
                <input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={contribValue}
                  onChange={(e) => setContribValue(e.target.value)}
                  placeholder="0.00"
                  className={inputClass}
                />
              </Field>
              <Field label="Περιγραφή">
                <input
                  type="text"
                  value={contribDesc}
                  onChange={(e) => setContribDesc(e.target.value)}
                  placeholder="π.χ. 10 μπουκάλια κρασί"
                  className={inputClass}
                />
              </Field>
            </div>
          </fieldset>

          {err && (
            <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
              {err}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border p-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-border px-4 py-2 text-sm transition hover:bg-background disabled:opacity-50"
          >
            Ακύρωση
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Προσθήκη…" : "Προσθήκη"}
          </button>
        </div>
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
