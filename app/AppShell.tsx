"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
  activePaths?: string[];
};

const SECTION_ORDER: NavSection[] = ["daily", "config"];

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Αρχική", permission: null, section: "daily" },
  { href: "/calendar", label: "Ημερολόγιο", permission: null, section: "daily" },
  { href: "/members", label: "Διαχείριση Μελών", permission: "members", section: "daily" },
  { href: "/events", label: "Εκδηλώσεις", permission: "events", section: "daily" },
  { href: "/seating", label: "Πλάνο Τραπεζιών", permission: "seating", section: "daily" },
  { href: "/finances", label: "Οικονομικά", permission: "finances", section: "daily" },
  {
    href: "/settings",
    label: "Ρυθμίσεις",
    permission: null,
    adminOnly: true,
    section: "config",
    activePaths: ["/discounts", "/settings/users"],
  },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const role = useRole();
  const { settings: club, clubName } = useClubSettings();
  const currentClub = useCurrentClub();
  const [signingOut, setSigningOut] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!userMenuOpen) return;

    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target as Node)
      ) {
        setUserMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setUserMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [userMenuOpen]);

  const headerTitle = currentClub.club?.name || clubName;

  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/login")
  ) {
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
        <div ref={userMenuRef} className="relative shrink-0 px-4 py-2 lg:py-5">
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="flex min-w-0 flex-1 items-center gap-2 lg:items-start"
            >
              {club.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={club.logo_url}
                  alt={headerTitle}
                  className="h-8 w-8 shrink-0 rounded-lg object-cover lg:h-9 lg:w-9"
                />
              ) : (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-primary)] text-sm font-semibold text-white lg:h-9 lg:w-9">
                  {(headerTitle?.[0] ?? "Σ").toUpperCase()}
                </span>
              )}
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-sm font-semibold lg:break-words lg:whitespace-normal">
                  {headerTitle}
                </span>
                <span className="mt-0.5 hidden text-[10px] uppercase tracking-wider text-muted lg:block">
                  SyllogosHub
                </span>
              </span>
            </Link>
            {!role.loading && isLoggedIn && (
              <button
                type="button"
                onClick={() => setUserMenuOpen((v) => !v)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold uppercase text-white lg:hidden"
                aria-label="Μενού χρήστη"
                aria-expanded={userMenuOpen}
              >
                {computeInitials(role.firstName, role.lastName, role.email)}
              </button>
            )}
            {!role.loading && !isLoggedIn && (
              <Link
                href="/login"
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-2 text-xs font-medium lg:hidden"
              >
                <UserIcon className="h-3.5 w-3.5" />
                Σύνδεση
              </Link>
            )}
          </div>
          {userMenuOpen && isLoggedIn && (
            <div className="absolute right-3 top-full z-30 mt-1 w-64 rounded-xl border border-border bg-surface p-3 shadow-lg lg:hidden">
              <UserMenuContent
                role={role}
                signingOut={signingOut}
                onSignOut={() => {
                  setUserMenuOpen(false);
                  handleSignOut();
                }}
              />
            </div>
          )}
        </div>
        <nav className="min-h-0 flex-1 overflow-hidden px-3 pb-3 lg:overflow-y-auto">
          <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-0.5 lg:overflow-x-visible">
            {SECTION_ORDER.flatMap((section, sectionIndex) => {
              const items = navItems.filter((it) => it.section === section);
              if (items.length === 0) return [];
              return [
                sectionIndex > 0 ? (
                  <li
                    key={`divider-${section}`}
                    className="hidden lg:my-2 lg:block lg:border-t lg:border-border/50"
                    aria-hidden
                  />
                ) : null,
                ...items.map((item) => {
                  const matchesExtra = (item.activePaths ?? []).some(
                    (p) => pathname === p || pathname.startsWith(p + "/")
                  );
                  const active =
                    item.href === "/"
                      ? pathname === "/"
                      : pathname === item.href ||
                        pathname.startsWith(item.href + "/") ||
                        matchesExtra;
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
        <div className="hidden shrink-0 border-t border-border p-3 lg:block">
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

function UserMenuContent({
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
    <div>
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
        <span className="mt-3 inline-block rounded-full border border-border bg-background px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
          {badgeLabel}
        </span>
      )}
      <div className="mt-3 border-t border-border pt-2">
        <button
          type="button"
          onClick={onSignOut}
          disabled={signingOut}
          className="block w-full rounded-md px-3 py-2 text-left text-sm transition hover:bg-foreground/5 disabled:opacity-50"
        >
          {signingOut ? "Αποσύνδεση…" : "Αποσύνδεση"}
        </button>
      </div>
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
