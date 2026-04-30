"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { errorMessage, getBrowserClient } from "@/lib/supabase/client";
import { useClubSettings } from "@/lib/hooks/useClubSettings";
import { useCurrentClub } from "@/lib/hooks/useCurrentClub";
import type { Event as EventRow, Reservation } from "@/lib/supabase/types";

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
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
            .select("*")
            .eq("event_id", eventId)
            .eq("club_id", clubId),
        ]);
        if (cancelled) return;
        if (evRes.error) throw evRes.error;
        if (rRes.error) throw rRes.error;
        setEvent(evRes.data);
        setReservations(rRes.data ?? []);
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
  }, [eventId, clubId, clubLoading]);

  const sorted = useMemo(
    () =>
      [...reservations].sort((a, b) =>
        a.group_name.localeCompare(b.group_name, "el")
      ),
    [reservations]
  );

  const totals = useMemo(() => {
    const pax = reservations.reduce((s, r) => s + r.pax_count, 0);
    const paid = reservations.filter((r) => r.is_paid).length;
    return { count: reservations.length, pax, paid };
  }, [reservations]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl p-10 text-center text-muted">
        Φόρτωση…
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="mx-auto max-w-3xl p-10 text-center text-danger">
        {error ?? "Δεν βρέθηκε η εκδήλωση."}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-6 print:p-0">
      <div className="mb-4 flex justify-end gap-2 print:hidden">
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

      <article className="rounded-xl border border-border bg-surface p-8 shadow-sm print:border-0 print:shadow-none">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
          <div className="flex items-center gap-4">
            {club.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={club.logo_url}
                alt={clubName}
                className="h-14 w-14 shrink-0 rounded-lg object-cover"
              />
            )}
            <div>
              <p className="text-sm text-muted">{clubName}</p>
              <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">
                {event.event_name}
              </h1>
              <p className="mt-1 text-sm text-muted">
                Λίστα Εισόδου —{" "}
                {new Date(event.event_date).toLocaleDateString("el-GR")}
              </p>
              <p className="mt-2 text-xs text-muted">
                {totals.count} παρέες · {totals.pax} άτομα · {totals.paid}{" "}
                εξοφλημένες
              </p>
            </div>
          </div>
        </header>

        {sorted.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            Δεν υπάρχουν κρατήσεις.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="py-2 pr-2">Παρέα</th>
                <th className="py-2 px-2">Τραπέζι</th>
                <th className="py-2 px-2">Άτομα</th>
                <th className="py-2 pl-2">Κατάσταση</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.map((r) => (
                <tr key={r.id}>
                  <td className="py-2 pr-2 font-medium">{r.group_name}</td>
                  <td className="py-2 px-2">
                    {r.table_number != null ? `Νο ${r.table_number}` : "—"}
                  </td>
                  <td className="py-2 px-2">{r.pax_count}</td>
                  <td className="py-2 pl-2">
                    {r.is_paid ? "✓ Εξοφλημένη" : "⏳ Εκκρεμεί"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
    </div>
  );
}
