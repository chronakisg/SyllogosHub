"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { errorMessage, getBrowserClient } from "@/lib/supabase/client";
import { useRole } from "@/lib/hooks/useRole";
import { AccessDenied } from "@/lib/auth/AccessDenied";
import { useClubSettings } from "@/lib/hooks/useClubSettings";
import type { Event as EventRow, Reservation } from "@/lib/supabase/types";

const eur = new Intl.NumberFormat("el-GR", {
  style: "currency",
  currency: "EUR",
});

type SummaryData = {
  event: EventRow;
  reservations: Reservation[];
};

type VenueTable = { id: string; capacity?: number };

function venueTables(raw: unknown): VenueTable[] {
  if (!raw || typeof raw !== "object") return [];
  const list = (raw as { tables?: unknown }).tables;
  return Array.isArray(list) ? (list as VenueTable[]) : [];
}

export default function EventSummaryPage() {
  const params = useParams<{ eventId: string }>();
  const eventId = params?.eventId;
  const role = useRole();
  const { settings: club } = useClubSettings();

  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const allowed =
    role.permissions.includes("events") ||
    role.permissions.includes("finances");

  useEffect(() => {
    if (!eventId || role.loading || !allowed) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = getBrowserClient();
        const [eRes, rRes] = await Promise.all([
          supabase.from("events").select("*").eq("id", eventId).single(),
          supabase
            .from("reservations")
            .select("*")
            .eq("event_id", eventId)
            .order("group_name", { ascending: true }),
        ]);
        if (cancelled) return;
        if (eRes.error) throw eRes.error;
        if (rRes.error) throw rRes.error;
        setData({
          event: eRes.data as EventRow,
          reservations: (rRes.data ?? []) as Reservation[],
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
  }, [eventId, role.loading, allowed]);

  if (role.loading || loading) {
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

  const { event, reservations } = data;
  const sortedReservations = [...reservations].sort((a, b) =>
    a.group_name.localeCompare(b.group_name, "el")
  );
  const tables = venueTables(event.venue_map_config);
  const totalTables = tables.length;
  const totalSeats = tables.reduce(
    (s, t) => s + (typeof t.capacity === "number" ? t.capacity : 0),
    0
  );
  const totalGroups = reservations.length;
  const paidGroups = reservations.filter((r) => r.is_paid);
  const paidGroupCount = paidGroups.length;
  const pendingGroupCount = totalGroups - paidGroupCount;
  const ticketPrice =
    event.ticket_price != null ? Number(event.ticket_price) : null;
  const paidRevenue =
    ticketPrice != null ? paidGroupCount * ticketPrice : null;
  const pendingRevenue =
    ticketPrice != null ? pendingGroupCount * ticketPrice : null;
  const expectedRevenue =
    paidRevenue != null && pendingRevenue != null
      ? paidRevenue + pendingRevenue
      : null;

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
              alt={club.club_name}
              className="h-16 w-16 rounded-lg object-cover"
            />
          )}
          <p className="text-sm text-muted">{club.club_name}</p>
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
          {event.location && (
            <SummaryRow label="📍 Τοποθεσία">{event.location}</SummaryRow>
          )}
          {event.sponsors && (
            <SummaryRow label="Χορηγοί">
              <span className="whitespace-pre-wrap">{event.sponsors}</span>
            </SummaryRow>
          )}
          {ticketPrice != null && (
            <SummaryRow label="Κόστος Πρόσκλησης">
              {eur.format(ticketPrice)}/άτομο
            </SummaryRow>
          )}
          {!event.location && !event.sponsors && ticketPrice == null && (
            <p className="text-sm text-muted">—</p>
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
          {ticketPrice == null ? (
            <p className="text-sm text-muted">
              Δεν έχει οριστεί κόστος πρόσκλησης.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <FinanceCell
                label="Έσοδα"
                value={eur.format(paidRevenue ?? 0)}
                hint={`${paidGroupCount} × ${eur.format(ticketPrice)}`}
                tone="success"
              />
              <FinanceCell
                label="Εκκρεμή"
                value={eur.format(pendingRevenue ?? 0)}
                hint={`${pendingGroupCount} × ${eur.format(ticketPrice)}`}
                tone="warning"
              />
              <FinanceCell
                label="Σύνολο Αναμενόμενο"
                value={eur.format(expectedRevenue ?? 0)}
                hint={`${totalGroups} παρέες`}
              />
            </div>
          )}
        </SummaryCard>

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

function FinanceCell({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "success" | "warning";
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-500/30 bg-emerald-500/5"
      : tone === "warning"
        ? "border-amber-500/30 bg-amber-500/5"
        : "border-border bg-background/40";
  return (
    <div className={"rounded-lg border p-4 " + toneClass}>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}
