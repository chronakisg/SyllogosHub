"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { useRole } from "@/lib/hooks/useRole";
import { useCurrentClub } from "@/lib/hooks/useCurrentClub";
import { AccessDenied } from "@/lib/auth/AccessDenied";

type EventSummary = {
  id: string;
  event_name: string;
  event_date: string;
};

export default function CashierPage() {
  const params = useParams<{ eventId: string }>();
  const eventId = params?.eventId;
  const role = useRole();
  const currentClub = useCurrentClub();

  const [event, setEvent] = useState<EventSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!eventId || !currentClub.club?.id) return;
    let cancelled = false;

    async function loadEvent() {
      setLoading(true);
      setError(null);
      try {
        const supabase = getBrowserClient();
        const { data, error: fetchError } = await supabase
          .from("events")
          .select("id, event_name, event_date")
          .eq("id", eventId)
          .eq("club_id", currentClub.club!.id)
          .maybeSingle();

        if (cancelled) return;
        if (fetchError) throw fetchError;
        if (!data) {
          setError("Δεν βρέθηκε η εκδήλωση.");
          return;
        }
        setEvent(data as EventSummary);
      } catch (err) {
        if (cancelled) return;
        console.error("Cashier event fetch failed:", err);
        setError(
          err instanceof Error
            ? err.message
            : "Αποτυχία φόρτωσης εκδήλωσης"
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadEvent();
    return () => {
      cancelled = true;
    };
  }, [eventId, currentClub.club?.id]);

  // Loading guard
  if (role.loading || currentClub.loading) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <p className="py-8 text-center text-sm text-muted">Φόρτωση…</p>
      </div>
    );
  }

  // Permission guard
  const allowed =
    role.permissions.includes("cashier") ||
    role.permissions.includes("finances") ||
    role.isPresident ||
    role.isSystemAdmin;

  if (role.userId && !allowed) {
    return <AccessDenied />;
  }

  // Missing eventId guard
  if (!eventId) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <p className="py-8 text-center text-sm text-muted">
          Λείπει η εκδήλωση.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <header className="sticky top-0 z-10 -mx-6 mb-4 border-b border-border bg-background px-6 py-3 lg:-mx-10 lg:px-10">
        <div className="mb-2 flex items-center gap-2">
          <Link
            href="/"
            className="text-sm text-muted transition hover:text-foreground"
            aria-label="Επιστροφή"
          >
            ← Πίσω
          </Link>
          <span className="flex-1 truncate text-sm font-semibold">
            💰 Ταμείο · {event?.event_name ?? "…"}
          </span>
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      {loading ? (
        <p className="py-8 text-center text-sm text-muted">Φόρτωση…</p>
      ) : !event ? (
        <p className="py-8 text-center text-sm text-muted">
          Δεν βρέθηκε η εκδήλωση.
        </p>
      ) : (
        <div className="rounded-lg border border-border bg-surface p-6 text-center">
          <p className="text-sm text-muted">
            Cashier interface — υπό κατασκευή.
          </p>
          <p className="mt-1 text-xs text-muted">
            (Skeleton commit — reservation cards έρχονται στο επόμενο commit)
          </p>
        </div>
      )}
    </div>
  );
}
