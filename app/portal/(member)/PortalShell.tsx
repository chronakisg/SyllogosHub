"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase/client";
import type { Member } from "@/lib/supabase/types";

type Branding = {
  clubName: string;
  logoUrl: string | null;
  primaryColor: string;
};

type PortalShellProps = {
  member: Member;
  branding: Branding;
  children: React.ReactNode;
};

// Sidebar entries Phase 1 — 3 entries.
// Headroom για Chunks 3-4 (Οι κρατήσεις μου, Τα οικονομικά μου, Τμήματα).
const NAV_ITEMS = [
  { href: "/portal", label: "Αρχική" },
  { href: "/portal/profile", label: "Το προφίλ μου" },
  { href: "/calendar", label: "Ημερολόγιο" },
];

// Helpers mirror των AppShell.tsx (lines 372-396).
// Inline για single-concern Commit 1 — DRY refactor flagged για later
// (extract σε lib/utils/memberDisplay.ts όταν εμφανιστεί 3ο call site).
function composeFullName(first: string | null, last: string | null): string | null {
  const f = first?.trim();
  const l = last?.trim();
  if (l && f) return `${l} ${f}`;
  if (l) return l;
  if (f) return f;
  return null;
}

function computeInitials(
  first: string | null,
  last: string | null,
  email: string | null,
): string {
  const f = first?.trim()[0];
  const l = last?.trim()[0];
  if (l && f) return `${l}${f}`.toUpperCase();
  if (l) return l.toUpperCase();
  if (f) return f.toUpperCase();
  if (email) return email.trim()[0].toUpperCase();
  return "—";
}

export function PortalShell({ member, branding, children }: PortalShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);

  const fullName = composeFullName(member.first_name, member.last_name);
  const displayName = fullName ?? member.email ?? "—";
  const initials = computeInitials(member.first_name, member.last_name, member.email);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      const supabase = getBrowserClient();
      await supabase.auth.signOut();
      router.replace("/portal/login");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top branded header — μπορντό border-top + logo + club name */}
      <header
        className="border-b border-border bg-background"
        style={{
          borderTopWidth: 4,
          borderTopColor: branding.primaryColor,
          borderTopStyle: "solid",
        }}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-3">
          {branding.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={branding.logoUrl}
              alt={branding.clubName}
              className="h-10 w-10 rounded-md object-contain"
            />
          )}
          <h1 className="text-lg font-semibold text-foreground">
            {branding.clubName}
          </h1>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-6 lg:flex-row">
        {/* Sidebar */}
        <aside className="w-full shrink-0 space-y-4 lg:w-64">
          {/* Nav */}
          <nav className="space-y-1">
            {NAV_ITEMS.map((item) => {
              // Defensive strict-prefix matching (lesson από PR #45 /me vs /members regression).
              const active =
                pathname === item.href ||
                (item.href !== "/portal" && pathname.startsWith(`${item.href}/`));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block rounded-md px-3 py-2 text-sm transition ${
                    active
                      ? "bg-accent text-white"
                      : "text-foreground hover:bg-muted/30"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* User card — mirror AppShell UserCard (lines 258-304), ΧΩΡΙΣ badge.
              Badge παραλείφθηκε: shell context ήδη implies "member" persona
              (visual redundancy principle). */}
          <div className="space-y-2">
            <div className="rounded-xl border border-border bg-background p-3">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-sm font-semibold uppercase text-white">
                  {initials}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {displayName}
                  </p>
                  {fullName && member.email && (
                    <p className="truncate text-[11px] text-muted">
                      {member.email}
                    </p>
                  )}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="block w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground transition hover:bg-muted/30 disabled:opacity-50"
            >
              {signingOut ? "Αποσύνδεση…" : "Αποσύνδεση"}
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
