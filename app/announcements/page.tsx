"use client";

import { useEffect, useState } from "react";
import { useRole } from "@/lib/hooks/useRole";
import { useCurrentClub } from "@/lib/hooks/useCurrentClub";
import { AccessDenied } from "@/lib/auth/AccessDenied";

type Status = "loading" | "ready" | "error";

type AnnouncementRow = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  published: boolean;
  created_at: string;
  department_id: string | null;
  department_name: string | null;
  created_by: string | null;
  created_by_name: string | null;
};

function formatGreekDate(iso: string): string {
  return new Date(iso).toLocaleDateString("el-GR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function AnnouncementsPage() {
  const role = useRole();
  const { clubId, loading: clubLoading } = useCurrentClub();
  const [announcements, setAnnouncements] = useState<AnnouncementRow[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Derived permission gate — δεν χρειάζεται effect/setState
  const isDenied =
    !role.loading && !role.permissions.includes("announcements");

  // Fetch data
  useEffect(() => {
    if (isDenied) return;
    if (role.loading || clubLoading) return;
    if (!clubId) return;

    let cancelled = false;

    async function fetchData() {
      try {
        const res = await fetch("/api/admin/announcements");
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: "Σφάλμα φόρτωσης" }));
          if (!cancelled) {
            setErrorMsg(body.error || `HTTP ${res.status}`);
            setStatus("error");
          }
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setAnnouncements(data.announcements ?? []);
          setStatus("ready");
        }
      } catch (e) {
        if (!cancelled) {
          console.error("[/announcements] fetch failed", e);
          setErrorMsg("Σφάλμα δικτύου");
          setStatus("error");
        }
      }
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [isDenied, role.loading, clubLoading, clubId]);

  // Render branches
  if (isDenied) {
    return <AccessDenied />;
  }

  if (status === "loading" || role.loading || clubLoading) {
    return (
      <div className="mx-auto w-full max-w-3xl p-10 text-center text-muted">
        Φόρτωση…
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">
          Ανακοινώσεις
        </h1>
        <p className="mt-1 text-sm text-muted">
          Διαχείριση ανακοινώσεων του συλλόγου.
        </p>
      </header>

      {status === "error" && (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200">
          {errorMsg ?? "Σφάλμα φόρτωσης"}
        </div>
      )}

      {announcements.length === 0 && status === "ready" ? (
        <div className="rounded-xl border border-border bg-background p-8 text-center">
          <p className="text-sm text-muted">
            Δεν υπάρχουν ανακοινώσεις ακόμα. Στο επόμενο step θα μπορείς να
            δημιουργείς από εδώ.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => (
            <AnnouncementCard key={a.id} announcement={a} />
          ))}
        </div>
      )}
    </div>
  );
}

function AnnouncementCard({ announcement }: { announcement: AnnouncementRow }) {
  const metadata = [
    formatGreekDate(announcement.created_at),
    announcement.created_by_name,
    announcement.department_name ? `Τμήμα: ${announcement.department_name}` : null,
  ].filter(Boolean);

  return (
    <article className="rounded-xl border border-border bg-background p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">
          {announcement.pinned && <span className="mr-1.5">📌</span>}
          {announcement.title}
        </h2>
        {!announcement.published && (
          <span className="shrink-0 rounded-full bg-muted/30 px-2.5 py-0.5 text-xs font-medium text-muted">
            Πρόχειρο
          </span>
        )}
      </div>

      <p className="mt-3 whitespace-pre-wrap text-sm text-foreground/90">
        {announcement.body}
      </p>

      <p className="mt-4 text-xs text-muted">
        {metadata.join(" · ")}
      </p>
    </article>
  );
}
