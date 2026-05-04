"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useRole } from "@/lib/hooks/useRole";
import { AccessDenied } from "@/lib/auth/AccessDenied";

type Card = {
  href: string;
  icon: string;
  title: string;
  description: string;
};

const CARDS: Card[] = [
  {
    href: "/settings/users",
    icon: "👥",
    title: "Χρήστες & Δικαιώματα",
    description: "Logins, ρόλοι και δικαιώματα πρόσβασης ανά ομάδα.",
  },
  {
    href: "/settings/club",
    icon: "🏛️",
    title: "Ταυτότητα Συλλόγου",
    description: "Στοιχεία επικοινωνίας, λογότυπο, χρώματα και θέματα.",
  },
  {
    href: "/settings/departments",
    icon: "👥",
    title: "Τμήματα",
    description: "Χορευτικά, μουσικά, θεατρικά τμήματα του συλλόγου.",
  },
  {
    href: "/settings/entertainment-types",
    icon: "🎵",
    title: "Είδη Συνεργατών",
    description: "DJ, Μπάντα, Ορχήστρα και άλλοι τύποι συνεργατών.",
  },
  {
    href: "/discounts",
    icon: "💰",
    title: "Εκπτώσεις",
    description: "Αυτόματες εκπτώσεις βάσει ηλικίας ή σειράς παιδιών.",
  },
];

export default function SettingsDashboardPage() {
  const role = useRole();
  const isPrivileged = role.isSystemAdmin || role.isPresident;

  if (role.loading) {
    return (
      <div className="mx-auto w-full max-w-6xl p-10 text-center text-muted">
        Φόρτωση…
      </div>
    );
  }
  if (role.userId && !isPrivileged) {
    return <AccessDenied />;
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <header className="mb-3">
        <h1 className="text-xl font-semibold tracking-tight">Ρυθμίσεις</h1>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map((c) => (
          <SettingCard key={c.href} card={c} />
        ))}
      </div>
    </div>
  );
}

function SettingCard({ card }: { card: Card }): ReactNode {
  return (
    <Link
      href={card.href}
      className="group flex flex-col rounded-xl border border-border bg-surface p-6 transition hover:border-[var(--brand-primary)]"
    >
      <span className="mb-3 text-3xl leading-none" aria-hidden>
        {card.icon}
      </span>
      <h2 className="text-lg font-semibold">{card.title}</h2>
      <p className="mt-1 flex-1 text-sm text-muted">{card.description}</p>
      <span className="mt-4 self-end text-sm font-medium text-[var(--brand-primary)] transition group-hover:translate-x-0.5">
        Διαχείριση →
      </span>
    </Link>
  );
}
