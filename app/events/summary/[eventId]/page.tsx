"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { useRole } from "@/lib/hooks/useRole";
import { useCurrentClub } from "@/lib/hooks/useCurrentClub";
import { AccessDenied } from "@/lib/auth/AccessDenied";
import { useClubSettings } from "@/lib/hooks/useClubSettings";
import type { Event as EventRow } from "@/lib/supabase/types";
import {
  EventSummaryPanel,
  type SummaryData,
} from "@/components/EventSummaryPanel";

export default function EventSummaryPage() {
  const params = useParams<{ eventId: string }>();
  const eventId = params?.eventId;
  const role = useRole();
  const currentClub = useCurrentClub();
  const { settings: club, clubName } = useClubSettings();
  const [event, setEvent] = useState<EventRow | null>(null);

  const allowed =
    role.permissions.includes("events") ||
    role.permissions.includes("finances");

  function handleLoad(_id: string, data: SummaryData) {
    setEvent(data.event);
  }

  if (role.loading || currentClub.loading) {
    return (
      <div className="mx-auto max-w-3xl p-10 text-center text-muted">
        Φόρτωση…
      </div>
    );
  }
  if (role.userId && !allowed) {
    return <AccessDenied />;
  }
  if (!eventId) {
    return (
      <div className="mx-auto max-w-3xl p-10 text-center text-danger">
        Δεν βρέθηκε η εκδήλωση.
      </div>
    );
  }

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
          {event && (
            <>
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
            </>
          )}
        </header>

        <EventSummaryPanel eventId={eventId} onLoad={handleLoad} />
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
