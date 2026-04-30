"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { useRole, type Permission, type RoleState } from "@/lib/hooks/useRole";
import { useClubSettings } from "@/lib/hooks/useClubSettings";
import { useCurrentClub } from "@/lib/hooks/useCurrentClub";

type NavSection = "daily" | "config";

type NavItem = {
  href: string;
  label: string;
  permission: Permission | null;
  adminOnly?: boolean;
  section: NavSection;
};

const SECTION_LABELS: Record<NavSection, string> = {
  daily: "Καθημερινή χρήση",
  config: "Διαμόρφωση",
};

const SECTION_ORDER: NavSection[] = ["daily", "config"];

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Αρχική", permission: null, section: "daily" },
  { href: "/calendar", label: "Ημερολόγιο", permission: null, section: "daily" },
  { href: "/members", label: "Διαχείριση Μελών", permission: "members", section: "daily" },
  { href: "/events", label: "Εκδηλώσεις", permission: "events", section: "daily" },
  { href: "/sponsors", label: "Χορηγοί", permission: "events", section: "daily" },
  { href: "/seating", label: "Πλάνο Τραπεζιών", permission: "seating", section: "daily" },
  { href: "/finances", label: "Οικονομικά", permission: "finances", section: "daily" },
  {
    href: "/discounts",
    label: "Εκπτώσεις",
    permission: "finances",
    section: "config",
  },
  {
    href: "/permissions",
    label: "Δικαιώματα",
    permission: null,
    adminOnly: true,
    section: "config",
  },
  {
    href: "/settings",
    label: "Ρυθμίσεις",
    permission: null,
    adminOnly: true,
    section: "config",
  },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const role = useRole();
  const { settings: club } = useClubSettings();
  const currentClub = useCurrentClub();
  const [signingOut, setSigningOut] = useState(false);

  const headerTitle = currentClub.club?.name || club.club_name;

  if (pathname === "/login") {
    return <>{children}</>;
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      const supabase = getBrowserClient();
      await supabase.auth.signOut();
      router.replace("/");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  const isLoggedIn = !!role.userId;
  const isPrivileged = role.isSystemAdmin || role.isPresident;
  const navItems = role.loading
    ? NAV_ITEMS.filter((item) => !item.adminOnly)
    : NAV_ITEMS.filter((item) => {
        if (item.adminOnly && !isPrivileged) return false;
        if (item.permission === null) return true;
        return role.permissions.includes(item.permission);
      });

  return (
    <div className="flex h-screen flex-col overflow-hidden lg:flex-row">
      <aside className="flex w-full shrink-0 flex-col border-b border-border bg-surface lg:h-screen lg:w-64 lg:border-b-0 lg:border-r">
        <div className="shrink-0 px-4 py-5">
          <Link href="/" className="flex items-start gap-2">
            {club.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={club.logo_url}
                alt={headerTitle}
                className="h-9 w-9 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-primary)] text-sm font-semibold text-white">
                {(headerTitle?.[0] ?? "Σ").toUpperCase()}
              </span>
            )}
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="break-words text-sm font-semibold">
                {headerTitle}
              </span>
              <span className="mt-0.5 text-[10px] uppercase tracking-wider text-muted">
                SyllogosHub
              </span>
            </span>
          </Link>
        </div>
        <nav className="min-h-0 flex-1 overflow-hidden px-3 pb-3 lg:overflow-y-auto">
          <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-0.5 lg:overflow-x-visible">
            {SECTION_ORDER.flatMap((section) => {
              const items = navItems.filter((it) => it.section === section);
              if (items.length === 0) return [];
              return [
                <li
                  key={`section-${section}`}
                  className="hidden shrink-0 lg:block lg:shrink"
                >
                  <p className="mt-4 mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted">
                    {SECTION_LABELS[section]}
                  </p>
                </li>,
                ...items.map((item) => {
                  const active =
                    item.href === "/"
                      ? pathname === "/"
                      : pathname === item.href ||
                        pathname.startsWith(item.href + "/");
                  return (
                    <li key={item.href} className="shrink-0 lg:shrink">
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={
                          "block w-full whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors " +
                          (active
                            ? "bg-[var(--brand-primary)] text-white"
                            : "text-foreground/80 hover:bg-foreground/5 hover:text-foreground")
                        }
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                }),
              ];
            })}
          </ul>
        </nav>
        <div className="shrink-0 border-t border-border p-3">
          {role.loading ? (
            <p className="px-3 text-xs text-muted">Φόρτωση…</p>
          ) : isLoggedIn ? (
            <UserCard
              role={role}
              signingOut={signingOut}
              onSignOut={handleSignOut}
            />
          ) : (
            <Link
              href="/login"
              className="flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:border-accent/60 hover:bg-foreground/5"
            >
              <UserIcon className="h-4 w-4" />
              Σύνδεση
            </Link>
          )}
        </div>
      </aside>
      <main className="min-h-0 flex-1 overflow-y-auto p-6 lg:p-10">
        {children}
      </main>
    </div>
  );
}

function UserCard({
  role,
  signingOut,
  onSignOut,
}: {
  role: RoleState;
  signingOut: boolean;
  onSignOut: () => void;
}) {
  const fullName = composeFullName(role.firstName, role.lastName);
  const displayName = fullName ?? role.email ?? "—";
  const initials = computeInitials(role.firstName, role.lastName, role.email);
  const badgeLabel = pickBadgeLabel(role);

  return (
    <div className="space-y-2">
      <div className="rounded-xl border border-border bg-background p-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold uppercase text-white">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              {displayName}
            </p>
            {fullName && role.email && (
              <p className="truncate text-[11px] text-muted">{role.email}</p>
            )}
          </div>
        </div>
        {badgeLabel && (
          <span className="mt-3 inline-block rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
            {badgeLabel}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={onSignOut}
        disabled={signingOut}
        className="block w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs transition hover:bg-foreground/5 disabled:opacity-50"
      >
        {signingOut ? "Αποσύνδεση…" : "Αποσύνδεση"}
      </button>
    </div>
  );
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function composeFullName(
  first: string | null,
  last: string | null
): string | null {
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
  email: string | null
): string {
  const f = first?.trim();
  const l = last?.trim();
  if (f && l) return (f[0] + l[0]).toUpperCase();
  if (l) return l.slice(0, 2).toUpperCase();
  if (f) return f.slice(0, 2).toUpperCase();
  if (email) return email.slice(0, 2).toUpperCase();
  return "?";
}

function pickBadgeLabel(role: RoleState): string {
  if (role.isSystemAdmin) return "Διαχειριστής";
  if (role.isPresident) return "Πρόεδρος";
  if (role.boardPosition) return role.boardPosition;
  if (role.isBoardMember) return "Δ.Σ.";
  return "Μέλος";
}
