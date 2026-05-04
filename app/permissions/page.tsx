"use client";

import { useState, type ReactNode } from "react";
import { AccessDenied } from "@/lib/auth/AccessDenied";
import { useRole } from "@/lib/hooks/useRole";
import { useCurrentClub } from "@/lib/hooks/useCurrentClub";
import { MembersTab } from "./MembersTab";
import { RolesTab } from "./RolesTab";

type Tab = "roles" | "members";

export default function PermissionsPage() {
  const role = useRole();
  const { clubId, loading: clubLoading } = useCurrentClub();
  const [activeTab, setActiveTab] = useState<Tab>("roles");

  const isPrivileged = role.isSystemAdmin || role.isPresident;

  if (role.loading || clubLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl p-10 text-center text-muted">
        Φόρτωση…
      </div>
    );
  }
  if (role.userId && !isPrivileged) {
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
        <h1 className="text-xl font-semibold tracking-tight">
          Ρόλοι &amp; Δικαιώματα
        </h1>
        <p className="mt-0.5 text-sm text-muted">
          Δικαιώματα ανά ρόλο (Ομάδες) και ατομικές εξαιρέσεις (Άτομα)
        </p>
      </header>

      <div
        role="tablist"
        className="mb-5 flex border-b border-border"
      >
        <TabButton active={activeTab === "roles"} onClick={() => setActiveTab("roles")}>
          Ομάδες (Ρόλοι)
        </TabButton>
        <TabButton active={activeTab === "members"} onClick={() => setActiveTab("members")}>
          Άτομα (Custom Overrides)
        </TabButton>
      </div>

      {activeTab === "roles" && <RolesTab clubId={clubId} />}
      {activeTab === "members" && <MembersTab clubId={clubId} />}
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
  children: ReactNode;
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
