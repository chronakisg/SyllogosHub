"use client";

import { useEffect, useRef, useState } from "react";
import { errorMessage, getBrowserClient } from "@/lib/supabase/client";
import { useCurrentClub } from "@/lib/hooks/useCurrentClub";
import { getEventEntertainers } from "@/lib/entertainers";
import type {
  ContributionType,
  Event as EventRow,
  EventEntertainerWithDetails,
  EventTicketPrice,
  Reservation,
} from "@/lib/supabase/types";

const eur = new Intl.NumberFormat("el-GR", {
  style: "currency",
  currency: "EUR",
});

type SponsorJoinRow = {
  contribution_type: ContributionType;
  contribution_value: number | null;
  contribution_description: string | null;
  sponsors: {
    id: string;
    member_id: string | null;
    external_name: string | null;
    members: { first_name: string; last_name: string } | null;
  } | null;
};

export type SponsorSummary = {
  name: string;
  isMember: boolean;
  contribution_type: ContributionType;
  contribution_value: number | null;
  contribution_description: string | null;
};

type TicketPriceWithCategory = EventTicketPrice & {
  category: { name: string } | null;
};

export type SummaryData = {
  event: EventRow;
  reservations: Reservation[];
  ticketPrices: TicketPriceWithCategory[];
  sponsors: SponsorSummary[];
  entertainers: EventEntertainerWithDetails[];
};

type VenueTable = { id: string; capacity?: number };

const CONTRIBUTION_LABEL: Record<ContributionType, string> = {
  money: "Χρήματα",
  product: "Προϊόν",
  service: "Υπηρεσία",
  venue: "Χώρος",
  other: "Άλλο",
};

function venueTables(raw: unknown): VenueTable[] {
  if (!raw || typeof raw !== "object") return [];
  const list = (raw as { tables?: unknown }).tables;
  return Array.isArray(list) ? (list as VenueTable[]) : [];
}

type Props = {
  eventId: string;
  cachedData?: SummaryData | null;
  onLoad?: (eventId: string, data: SummaryData) => void;
};

export function EventSummaryPanel({ eventId, cachedData, onLoad }: Props) {
  const { clubId, loading: clubLoading } = useCurrentClub();
  const hasCache = cachedData != null;
  const [data, setData] = useState<SummaryData | null>(cachedData ?? null);
  const [loading, setLoading] = useState(!hasCache);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const onLoadRef = useRef(onLoad);
  useEffect(() => {
    onLoadRef.current = onLoad;
  });

  useEffect(() => {
    if (clubLoading || hasCache) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const supabase = getBrowserClient();
        let eventQuery = supabase
          .from("events")
          .select("*")
          .eq("id", eventId);
        if (clubId) eventQuery = eventQuery.eq("club_id", clubId);

        const [eRes, rRes, tRes, spRes, entList] = await Promise.all([
          eventQuery.single(),
          supabase
            .from("reservations")
            .select("*")
            .eq("event_id", eventId)
            .order("group_name", { ascending: true }),
          supabase
            .from("event_ticket_prices")
            .select("*, category:ticket_categories(name)")
            .eq("event_id", eventId)
            .order("display_order", { ascending: true }),
          supabase
            .from("event_sponsors")
            .select(
              "contribution_type, contribution_value, contribution_description, sponsors(id, member_id, external_name, members(first_name, last_name))"
            )
            .eq("event_id", eventId),
          getEventEntertainers(eventId),
        ]);

        if (cancelled) return;
        if (eRes.error) throw eRes.error;
        if (rRes.error) throw rRes.error;
        if (tRes.error) throw tRes.error;
        if (spRes.error) throw spRes.error;

        const sponsorRows = (
          (spRes.data ?? []) as unknown as SponsorJoinRow[]
        )
          .map<SponsorSummary | null>((row) => {
            const sp = row.sponsors;
            if (!sp) return null;
            const isMember = !!sp.member_id;
            const name =
              isMember && sp.members
                ? `${sp.members.last_name} ${sp.members.first_name}`.trim()
                : (sp.external_name ?? "—");
            return {
              name,
              isMember,
              contribution_type: row.contribution_type,
              contribution_value: row.contribution_value,
              contribution_description: row.contribution_description,
            };
          })
          .filter((x): x is SponsorSummary => !!x);

        const result: SummaryData = {
          event: eRes.data as EventRow,
          reservations: (rRes.data ?? []) as Reservation[],
          ticketPrices: (tRes.data ?? []) as TicketPriceWithCategory[],
          sponsors: sponsorRows,
          entertainers: entList,
        };

        setData(result);
        setLoading(false);
        onLoadRef.current?.(eventId, result);
      } catch (err) {
        if (cancelled) return;
        setError(errorMessage(err, "Σφάλμα φόρτωσης σύνοψης."));
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [eventId, clubId, clubLoading, retryCount, hasCache]);

  if (loading) return <PanelLoading />;
  if (error)
    return (
      <PanelError
        message={error}
        onRetry={() => setRetryCount((c) => c + 1)}
      />
    );
  if (!data) return null;

  const { event, reservations, ticketPrices, sponsors, entertainers } = data;
  const entertainersTotal = entertainers.reduce(
    (sum, e) => sum + (e.fee ?? 0),
    0
  );
  const sortedReservations = [...reservations].sort((a, b) =>
    a.group_name.localeCompare(b.group_name, "el", { sensitivity: "base" })
  );
  const tables = venueTables(event.venue_map_config);
  const totalTables = tables.length;
  const totalSeats = tables.reduce(
    (s, t) => s + (typeof t.capacity === "number" ? t.capacity : 0),
    0
  );
  const totalGroups = reservations.length;
  const paidGroupCount = reservations.filter((r) => r.is_paid).length;
  const pendingGroupCount = totalGroups - paidGroupCount;
  const sponsorMonetary = sponsors.reduce(
    (s, sp) =>
      sp.contribution_type === "money" && sp.contribution_value != null
        ? s + sp.contribution_value
        : s,
    0
  );

  return (
    <div>
      <SummaryCard title="Στοιχεία">
        {event.location ? (
          <SummaryRow label="📍 Τοποθεσία">{event.location}</SummaryRow>
        ) : (
          <p className="text-sm text-muted">—</p>
        )}
      </SummaryCard>

      <SummaryCard title="Συνεργάτες">
        {entertainers.length === 0 ? (
          <p className="text-sm text-muted">Δεν έχουν οριστεί συνεργάτες.</p>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="py-2 text-left">Όνομα</th>
                  <th className="py-2 text-left">Τύπος</th>
                  <th className="py-2 text-right">Αμοιβή</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entertainers.map((e) => (
                  <tr key={e.id}>
                    <td className="py-2 font-medium">{e.entertainer.name}</td>
                    <td className="py-2 text-muted">
                      {e.entertainer.entertainment_type?.name ?? "—"}
                    </td>
                    <td className="py-2 text-right">
                      {e.fee != null ? eur.format(e.fee) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-sm">
              <span className="text-muted">Σύνολο αμοιβών: </span>
              <span className="font-semibold">
                {eur.format(entertainersTotal)}
              </span>
            </p>
          </>
        )}
      </SummaryCard>

      <SummaryCard title="Τιμές Πρόσκλησης">
        {ticketPrices.length === 0 ? (
          <p className="text-sm text-muted">
            Δεν έχουν οριστεί κατηγορίες τιμών.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="py-2 text-left">Κατηγορία</th>
                <th className="py-2 text-right">Τιμή</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ticketPrices.map((t) => (
                <tr key={t.id}>
                  <td className="py-2 font-medium">{t.category?.name ?? "—"}</td>
                  <td className="py-2 text-right">{eur.format(t.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SummaryCard>

      <SummaryCard title="Στατιστικά">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="Τραπέζια" value={totalTables} />
          <Stat label="Διαθ. Θέσεις" value={totalSeats} />
          <Stat label="Παρέες" value={totalGroups} />
          <Stat label="Πληρωμένες" value={paidGroupCount} tone="success" />
          <Stat label="Εκκρεμείς" value={pendingGroupCount} tone="warning" />
        </div>
      </SummaryCard>

      <SummaryCard title="Οικονομικά">
        <p className="text-sm text-muted">
          Έσοδα: μη υπολογίσιμα — ορίστε τιμές και συνδέστε reservations με
          κατηγορία τιμής.
        </p>
        {sponsors.length > 0 && (
          <p className="mt-2 text-sm">
            <span className="text-muted">Χορηγίες σε χρήμα: </span>
            <span className="font-semibold">{eur.format(sponsorMonetary)}</span>
          </p>
        )}
      </SummaryCard>

      {sponsors.length > 0 && (
        <SummaryCard title="Χορηγοί">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="py-2 text-left">Όνομα</th>
                <th className="py-2 text-left">Τύπος</th>
                <th className="py-2 text-left">Προσφορά</th>
                <th className="py-2 text-right">Αξία</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sponsors.map((s, i) => (
                <tr key={i}>
                  <td className="py-2 font-medium">{s.name}</td>
                  <td className="py-2 text-muted">
                    {s.isMember ? "Μέλος" : "Εξωτερικός"}
                  </td>
                  <td className="py-2 text-muted">
                    {CONTRIBUTION_LABEL[s.contribution_type]}
                    {s.contribution_description
                      ? ` · ${s.contribution_description}`
                      : ""}
                  </td>
                  <td className="py-2 text-right">
                    {s.contribution_value != null
                      ? eur.format(s.contribution_value)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </SummaryCard>
      )}

      <SummaryCard title="Παρέες">
        {sortedReservations.length === 0 ? (
          <p className="text-sm text-muted">Δεν υπάρχουν κρατήσεις.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="py-2 text-left">Όνομα Παρέας</th>
                <th className="py-2 text-right">Άτομα</th>
                <th className="py-2 text-right">Τραπέζι</th>
                <th className="py-2 text-right">Πληρωμή</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sortedReservations.map((r) => (
                <tr key={r.id}>
                  <td className="py-2 font-medium">{r.group_name}</td>
                  <td className="py-2 text-right">{r.pax_count}</td>
                  <td className="py-2 text-right">
                    {r.table_number != null ? `Νο ${r.table_number}` : "—"}
                  </td>
                  <td className="py-2 text-right">
                    {r.is_paid ? "Πληρωμένη" : "Εκκρεμεί"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SummaryCard>
    </div>
  );
}

function PanelLoading() {
  return (
    <div className="flex items-center justify-center py-8 text-muted">
      <span className="text-sm">Φόρτωση σύνοψης…</span>
    </div>
  );
}

function PanelError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-danger/30 bg-danger/5 px-4 py-3 text-sm">
      <span className="text-danger">Σφάλμα: {message}</span>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-md border border-border bg-surface px-3 py-1 text-foreground hover:bg-background"
      >
        Δοκιμή ξανά
      </button>
    </div>
  );
}

function SummaryCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="print-card mb-6 rounded-lg border border-border p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
        {title}
      </h2>
      {children}
    </section>
  );
}

function SummaryRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <p className="mt-1 text-sm">
      <span className="text-muted">{label}: </span>
      <span className="font-medium">{children}</span>
    </p>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "warning";
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-500/30 bg-emerald-500/5"
      : tone === "warning"
        ? "border-amber-500/30 bg-amber-500/5"
        : "border-border bg-background/40";
  return (
    <div className={"rounded-lg border p-3 " + toneClass}>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">
        {value.toLocaleString("el-GR")}
      </p>
    </div>
  );
}
