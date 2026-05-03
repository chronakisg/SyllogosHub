"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { errorMessage, getBrowserClient } from "@/lib/supabase/client";
import { useRole } from "@/lib/hooks/useRole";
import { useCurrentClub } from "@/lib/hooks/useCurrentClub";
import { AccessDenied } from "@/lib/auth/AccessDenied";
import { useClubSettings } from "@/lib/hooks/useClubSettings";
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

type SponsorSummary = {
  name: string;
  isMember: boolean;
  contribution_type: ContributionType;
  contribution_value: number | null;
  contribution_description: string | null;
};

type SummaryData = {
  event: EventRow;
  reservations: Reservation[];
  ticketPrices: EventTicketPrice[];
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

export default function EventSummaryPage() {
  const params = useParams<{ eventId: string }>();
  const eventId = params?.eventId;
  const role = useRole();
  const currentClub = useCurrentClub();
  const { settings: club, clubName } = useClubSettings();

  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const allowed =
    role.permissions.includes("events") ||
    role.permissions.includes("finances");

  useEffect(() => {
    if (!eventId || role.loading || !allowed) return;
    if (currentClub.loading) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = getBrowserClient();
        let eventQuery = supabase
          .from("events")
          .select("*")
          .eq("id", eventId);
        if (currentClub.clubId)
          eventQuery = eventQuery.eq("club_id", currentClub.clubId);

        const [eRes, rRes, tRes, spRes, entList] = await Promise.all([
          eventQuery.single(),
          supabase
            .from("reservations")
            .select("*")
            .eq("event_id", eventId)
            .order("group_name", { ascending: true }),
          supabase
            .from("event_ticket_prices")
            .select("*")
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

        const sponsorRows = ((spRes.data ?? []) as unknown as SponsorJoinRow[])
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

        setData({
          event: eRes.data as EventRow,
          reservations: (rRes.data ?? []) as Reservation[],
          ticketPrices: (tRes.data ?? []) as EventTicketPrice[],
          sponsors: sponsorRows,
          entertainers: entList,
        });
      } catch (err) {
        if (!cancelled)
          setError(errorMessage(err, "Σφάλμα φόρτωσης σύνοψης."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId, role.loading, allowed, currentClub.loading, currentClub.clubId]);

  if (role.loading || loading || currentClub.loading) {
    return (
      <div className="mx-auto max-w-3xl p-10 text-center text-muted">
        Φόρτωση…
      </div>
    );
  }
  if (role.userId && !allowed) {
    return <AccessDenied />;
  }
  if (error || !data) {
    return (
      <div className="mx-auto max-w-3xl p-10 text-center text-danger">
        {error ?? "Δεν βρέθηκε η εκδήλωση."}
      </div>
    );
  }

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
    <div className="mx-auto max-w-4xl p-6 print:max-w-none print:p-0">
      <button
        type="button"
        onClick={() => window.print()}
        className="sticky top-4 z-10 float-right rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-md transition hover:opacity-90 print:hidden"
      >
        🖨 Εκτύπωση
      </button>

      <div className="rounded-xl border border-border bg-surface p-8 shadow-sm print:border-0 print:shadow-none">
        <header className="mb-8 flex flex-col items-center gap-2 border-b border-border pb-6 text-center">
          {club.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={club.logo_url}
              alt={clubName}
              className="h-16 w-16 rounded-lg object-cover"
            />
          )}
          <p className="text-sm text-muted">{clubName}</p>
          <h1 className="text-3xl font-semibold tracking-tight">
            {event.event_name}
          </h1>
          <p className="text-sm text-muted">
            {new Date(event.event_date).toLocaleDateString("el-GR", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </header>

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
                      <td className="py-2 font-medium">
                        {e.entertainer.name}
                      </td>
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
                    <td className="py-2 font-medium">{t.label}</td>
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
              <span className="font-semibold">
                {eur.format(sponsorMonetary)}
              </span>
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

      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 1.5cm;
          }
          body {
            background: #fff !important;
            color: #000 !important;
          }
          aside,
          nav,
          header.app-header,
          .print\\:hidden {
            display: none !important;
          }
          main {
            padding: 0 !important;
          }
          .print-card,
          section {
            page-break-inside: avoid;
          }
        }
      `}</style>
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
