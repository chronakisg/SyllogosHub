"use client";

import { useState } from "react";
import Link from "next/link";
import { AccessDenied } from "@/lib/auth/AccessDenied";
import { useRole } from "@/lib/hooks/useRole";
import { useCurrentClub } from "@/lib/hooks/useCurrentClub";
import { PeopleTab } from "./PeopleTab";
import { RolesTab } from "./RolesTab";

type Tab = "people" | "roles";

export default function UsersPage() {
  const role = useRole();
  const { clubId, loading: clubLoading } = useCurrentClub();
  const [activeTab, setActiveTab] = useState<Tab>("people");

  const isPrivileged = role.isSystemAdmin || role.isPresident;

  if (role.loading || clubLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl p-10 text-center text-muted">
        Φόρτωση…
      </div>
    );
  }

  if (!isPrivileged) {
    return <AccessDenied />;
  }

  if (!clubId) {
    return (
      <div className="mx-auto w-full max-w-6xl p-10 text-center text-muted">
        Δεν βρέθηκε σύλλογος.
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <header className="mb-4">
        <Link
          href="/settings"
          className="inline-flex items-baseline gap-2 text-xl font-semibold tracking-tight text-foreground transition hover:text-foreground/70"
        >
          <span aria-hidden="true">←</span>
          Χρήστες &amp; Δικαιώματα
        </Link>
        <p className="mt-0.5 text-sm text-muted">
          Διαχείριση πρόσβασης (logins, ρόλοι) και δικαιωμάτων ανά ομάδα
        </p>
      </header>

      <div role="tablist" className="mb-5 flex border-b border-border">
        <TabButton
          active={activeTab === "people"}
          onClick={() => setActiveTab("people")}
        >
          Άτομα
        </TabButton>
        <TabButton
          active={activeTab === "roles"}
          onClick={() => setActiveTab("roles")}
        >
          Ομάδες (Ρόλοι)
        </TabButton>
      </div>

      {activeTab === "people" && <PeopleTab clubId={clubId} />}
      {activeTab === "roles" && <RolesTab clubId={clubId} />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        "px-4 py-2 text-sm font-medium transition border-b-2 -mb-px " +
        (active
          ? "border-accent text-accent"
          : "border-transparent text-muted hover:text-foreground hover:border-border")
      }
    >
      {children}
    </button>
  );
}
