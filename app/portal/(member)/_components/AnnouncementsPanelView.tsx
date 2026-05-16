'use client';

import { useState } from "react";
import type { AnnouncementWithMeta } from "@/lib/portal/announcements";

function formatGreekDate(iso: string): string {
  return new Date(iso).toLocaleDateString("el-GR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function AnnouncementCard({
  announcement,
}: {
  announcement: AnnouncementWithMeta;
}) {
  return (
    <article className="rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-sm font-semibold text-foreground">
          {announcement.pinned && <span className="mr-1.5">📌</span>}
          {announcement.title}
        </h4>
        {announcement.is_new && (
          <span className="shrink-0 rounded-full border border-[#800000] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#800000]">
            Νέο
          </span>
        )}
      </div>

      <p className="mt-2 whitespace-pre-wrap text-sm text-muted">
        {announcement.body}
      </p>

      <p className="mt-3 text-xs text-muted">
        {formatGreekDate(announcement.created_at)}
      </p>
    </article>
  );
}

/**
 * Client view: collapsible panel.
 * Default state: open αν unreadCount > 0, αλλιώς closed.
 * Click στο header → toggle.
 * Empty state (totalCount === 0) renders inline χωρίς collapse affordance.
 */
export function AnnouncementsPanelView({
  announcements,
  unreadCount,
  totalCount,
}: {
  announcements: AnnouncementWithMeta[];
  unreadCount: number;
  totalCount: number;
}) {
  const [isOpen, setIsOpen] = useState(unreadCount > 0);

  if (totalCount === 0) {
    return (
      <section className="rounded-xl border border-border bg-background p-6">
        <h3 className="text-base font-semibold text-foreground">
          Ανακοινώσεις
        </h3>
        <p className="mt-2 text-sm text-muted">
          Δεν υπάρχουν ανακοινώσεις αυτή τη στιγμή.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-background p-6">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-foreground">
            Ανακοινώσεις
          </h3>
          <span className="text-sm text-muted">({totalCount})</span>
          {unreadCount > 0 && (
            <span className="rounded-full bg-[#800000] px-2.5 py-0.5 text-xs font-medium text-white">
              {unreadCount} {unreadCount === 1 ? "νέα" : "νέες"}
            </span>
          )}
        </div>
        <span
          aria-hidden="true"
          className={`text-muted transition-transform ${isOpen ? "rotate-180" : ""}`}
        >
          ▾
        </span>
      </button>

      {isOpen && (
        <div className="mt-4 space-y-3">
          {announcements.map((a) => (
            <AnnouncementCard key={a.id} announcement={a} />
          ))}
        </div>
      )}
    </section>
  );
}
