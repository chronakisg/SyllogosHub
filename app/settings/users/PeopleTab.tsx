"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { errorMessage, getBrowserClient } from "@/lib/supabase/client";
import { formatMemberName } from "@/lib/utils/attendees";
import { generatePassword } from "@/lib/utils/password";
import type { Member, MemberRole } from "@/lib/supabase/types";

// ─────────── Types ───────────

type LoginStatus = {
  hasLogin: boolean;
  banned: boolean;
  lastSignIn: string | null;
};

type AssignedRole = {
  role_id: string;
  name: string;
};

// ─────────── Styles ───────────

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

function btn(variant: "primary" | "danger" | "ghost") {
  const base =
    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 ";
  switch (variant) {
    case "primary":
      return base + "bg-accent text-white hover:bg-accent/90";
    case "danger":
      return (
        base +
        "border border-danger/30 bg-danger/10 text-danger hover:bg-danger/20"
      );
    default:
      return base + "border border-border hover:bg-foreground/5";
  }
}

// ─────────────────────────────────────────────────────────────────
// PeopleTab
// ─────────────────────────────────────────────────────────────────

export function PeopleTab({ clubId }: { clubId: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  useEffect(() => {
    if (!clubId) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = getBrowserClient();
        const { data, error: qErr } = await supabase
          .from("members")
          .select("*")
          .eq("club_id", clubId)
          .order("last_name", { ascending: true })
          .order("first_name", { ascending: true });
        if (cancelled) return;
        if (qErr) throw qErr;
        setMembers((data ?? []) as Member[]);
      } catch (err) {
        if (!cancelled)
          setListError(errorMessage(err, "Σφάλμα φόρτωσης μελών."));
      } finally {
        if (!cancelled) setListLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clubId]);

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) =>
      `${m.last_name ?? ""} ${m.first_name ?? ""} ${m.email ?? ""}`
        .toLowerCase()
        .includes(q)
    );
  }, [members, search]);

  const selected = useMemo(
    () => members.find((m) => m.id === selectedId) ?? null,
    [members, selectedId]
  );

  return (
    <div className="mx-auto w-full max-w-6xl">
      {listError && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          {listError}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        {/* Left: member list */}
        <aside className="rounded-xl border border-border bg-surface">
          <div className="border-b border-border p-3">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Αναζήτηση μέλους…"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </div>
          {listLoading ? (
            <p className="p-4 text-sm text-muted">Φόρτωση…</p>
          ) : filteredMembers.length === 0 ? (
            <p className="p-4 text-sm text-muted">Καμία αντιστοίχιση.</p>
          ) : (
            <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto">
              {filteredMembers.map((m) => {
                const active = m.id === selectedId;
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(m.id)}
                      className={
                        "flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm transition " +
                        (active
                          ? "bg-accent/10 text-accent"
                          : "hover:bg-foreground/5")
                      }
                    >
                      <span className="font-medium">{formatMemberName(m)}</span>
                      {m.email && (
                        <span className="text-[11px] text-muted">{m.email}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        {/* Right: detail panel */}
        <section className="rounded-xl border border-border bg-surface p-4">
          {!selected ? (
            <p className="py-16 text-center text-sm text-muted">
              Επιλέξτε μέλος για διαχείριση.
            </p>
          ) : (
            <MemberDetail member={selected} clubId={clubId} />
          )}
        </section>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Detail panel
// ─────────────────────────────────────────────────────────────────

function MemberDetail({ member, clubId }: { member: Member; clubId: string }) {
  const [loginStatus, setLoginStatus] = useState<LoginStatus | null>(null);
  const [loginLoading, setLoginLoading] = useState(true);
  const [assignedRoles, setAssignedRoles] = useState<AssignedRole[]>([]);
  const [availableRoles, setAvailableRoles] = useState<MemberRole[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [createLoginOpen, setCreateLoginOpen] = useState(false);
  const [resetPwOpen, setResetPwOpen] = useState(false);
  const [addRoleOpen, setAddRoleOpen] = useState(false);

  const loadLoginStatus = useCallback(async () => {
    setLoginLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${member.id}/login`);
      if (res.ok) {
        setLoginStatus((await res.json()) as LoginStatus);
      } else {
        setLoginStatus({ hasLogin: false, banned: false, lastSignIn: null });
      }
    } catch {
      setLoginStatus({ hasLogin: false, banned: false, lastSignIn: null });
    } finally {
      setLoginLoading(false);
    }
  }, [member.id]);

  const loadRoles = useCallback(async () => {
    const supabase = getBrowserClient();
    const { data } = await supabase
      .from("member_role_assignments")
      .select("role_id, member_roles!inner(name)")
      .eq("member_id", member.id);
    setAssignedRoles(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (data ?? []).map((r: any) => ({
        role_id: r.role_id as string,
        name: (r.member_roles as { name: string }).name,
      }))
    );
  }, [member.id]);

  useEffect(() => {
    setError(null);
    setInfo(null);
    void loadLoginStatus();
    void loadRoles();
  }, [loadLoginStatus, loadRoles]);

  useEffect(() => {
    getBrowserClient()
      .from("member_roles")
      .select(
        "id, club_id, name, description, is_system, display_order, created_at, updated_at"
      )
      .eq("club_id", clubId)
      .order("display_order")
      .then(({ data }) => setAvailableRoles((data ?? []) as MemberRole[]));
  }, [clubId]);

  async function handleDisableLogin() {
    if (!confirm(`Απενεργοποίηση σύνδεσης για ${formatMemberName(member)};`))
      return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${member.id}/login`, {
        method: "DELETE",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Σφάλμα");
      setInfo("Η σύνδεση απενεργοποιήθηκε.");
      void loadLoginStatus();
    } catch (err) {
      setError(errorMessage(err, "Σφάλμα απενεργοποίησης."));
    } finally {
      setBusy(false);
    }
  }

  async function handleEnableLogin() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/users/${member.id}/login/enable`,
        { method: "POST" }
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Σφάλμα");
      setInfo("Η σύνδεση ενεργοποιήθηκε.");
      void loadLoginStatus();
    } catch (err) {
      setError(errorMessage(err, "Σφάλμα ενεργοποίησης."));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveRole(roleId: string, roleName: string) {
    if (
      !confirm(
        `Αφαίρεση ρόλου «${roleName}» από ${formatMemberName(member)};`
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/users/${member.id}/roles/${roleId}`,
        { method: "DELETE" }
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Σφάλμα");
      setInfo(`Ρόλος «${roleName}» αφαιρέθηκε.`);
      void loadRoles();
    } catch (err) {
      setError(errorMessage(err, "Σφάλμα αφαίρεσης ρόλου."));
    } finally {
      setBusy(false);
    }
  }

  const assignedRoleIds = useMemo(
    () => new Set(assignedRoles.map((r) => r.role_id)),
    [assignedRoles]
  );
  const unassignedRoles = useMemo(
    () => availableRoles.filter((r) => !assignedRoleIds.has(r.id)),
    [availableRoles, assignedRoleIds]
  );

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}
      {info && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
          {info}
        </div>
      )}

      {/* § 1: Member header */}
      <div>
        <h2 className="text-base font-semibold">{formatMemberName(member)}</h2>
        {member.email && (
          <p className="mt-0.5 text-sm text-muted">{member.email}</p>
        )}
        {member.board_position && (
          <span className="mt-1 inline-block rounded-full bg-accent/10 px-2 py-0.5 text-xs text-accent">
            {member.board_position}
          </span>
        )}
      </div>

      <hr className="border-border" />

      {/* § 2: Login access */}
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Πρόσβαση Σύνδεσης
        </h3>
        {loginLoading ? (
          <p className="text-sm text-muted">Φόρτωση…</p>
        ) : loginStatus?.hasLogin ? (
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={
                "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium " +
                (loginStatus.banned
                  ? "bg-danger/10 text-danger"
                  : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300")
              }
            >
              {loginStatus.banned ? "Απενεργοποιημένος" : "Ενεργός"}
            </span>
            {loginStatus.lastSignIn && (
              <span className="text-xs text-muted">
                Τελευταία:{" "}
                {new Date(loginStatus.lastSignIn).toLocaleDateString("el-GR")}
              </span>
            )}
            <div className="flex flex-wrap gap-2">
              {loginStatus.banned ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleEnableLogin}
                  className={btn("primary")}
                >
                  Ενεργοποίηση
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setResetPwOpen(true)}
                    className={btn("ghost")}
                  >
                    Επαναφορά Password
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleDisableLogin}
                    className={btn("danger")}
                  >
                    Απενεργοποίηση
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted">Δεν υπάρχει λογαριασμός.</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => setCreateLoginOpen(true)}
              className={btn("primary")}
            >
              Δημιουργία Λογαριασμού
            </button>
          </div>
        )}
      </div>

      <hr className="border-border" />

      {/* § 3: Roles */}
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Ρόλοι
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          {assignedRoles.length === 0 && (
            <span className="text-sm text-muted">
              Κανένας ρόλος ανατεθειμένος.
            </span>
          )}
          {assignedRoles.map((r) => (
            <span
              key={r.role_id}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-0.5 text-xs"
            >
              {r.name}
              <button
                type="button"
                disabled={busy}
                onClick={() => handleRemoveRole(r.role_id, r.name)}
                className="ml-0.5 rounded-full text-muted transition hover:text-danger disabled:opacity-50"
                aria-label={`Αφαίρεση ρόλου ${r.name}`}
              >
                ✕
              </button>
            </span>
          ))}
          {unassignedRoles.length > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setAddRoleOpen(true)}
              className={btn("ghost")}
            >
              + Προσθήκη Ρόλου
            </button>
          )}
        </div>
      </div>

      <hr className="border-border" />

      {/* § 4: Custom permissions */}
      <div>
        <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">
          Προσαρμοσμένα Δικαιώματα
        </h3>
        <p className="mb-2 text-xs text-muted">
          Εξαιρέσεις που υπερισχύουν του ρόλου για αυτό το μέλος.
        </p>
        <Link href="/settings/users" className={btn("ghost")}>
          Διαχείριση →
        </Link>
      </div>

      {/* Modals */}
      {createLoginOpen && (
        <CreateLoginModal
          member={member}
          onClose={() => setCreateLoginOpen(false)}
          onCreated={() => {
            setCreateLoginOpen(false);
            setInfo("Ο λογαριασμός δημιουργήθηκε επιτυχώς.");
            void loadLoginStatus();
          }}
          onError={setError}
        />
      )}
      {resetPwOpen && (
        <ResetPasswordModal
          memberId={member.id}
          onClose={() => setResetPwOpen(false)}
          onReset={() => {
            setResetPwOpen(false);
            setInfo("Το password άλλαξε επιτυχώς.");
          }}
          onError={setError}
        />
      )}
      {addRoleOpen && (
        <AddRoleModal
          memberId={member.id}
          roles={unassignedRoles}
          onClose={() => setAddRoleOpen(false)}
          onAdded={() => {
            setAddRoleOpen(false);
            setInfo("Ο ρόλος ανατέθηκε επιτυχώς.");
            void loadRoles();
          }}
          onError={setError}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Modal: Create Login
// ─────────────────────────────────────────────────────────────────

function CreateLoginModal({
  member,
  onClose,
  onCreated,
  onError,
}: {
  member: Member;
  onClose: () => void;
  onCreated: () => void;
  onError: (msg: string) => void;
}) {
  const [email, setEmail] = useState(member.email ?? "");
  const [password, setPassword] = useState(() => generatePassword());
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${member.id}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const body = await res.json();
      if (!res.ok) {
        onError(body.error ?? "Σφάλμα δημιουργίας λογαριασμού.");
        return;
      }
      onCreated();
    } catch (err) {
      onError(errorMessage(err, "Σφάλμα δημιουργίας λογαριασμού."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title="Δημιουργία Λογαριασμού" onClose={onClose} busy={saving}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">Password</label>
          <div className="flex gap-2">
            <input
              type="text"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputCls + " font-mono"}
            />
            <button
              type="button"
              onClick={() => setPassword(generatePassword())}
              className={btn("ghost") + " shrink-0"}
            >
              Νέο
            </button>
          </div>
          <p className="mt-1 text-xs text-muted">
            Αντιγράψτε το password πριν κλείσετε — δεν αποθηκεύεται.
          </p>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className={btn("ghost")}
          >
            Ακύρωση
          </button>
          <button type="submit" disabled={saving} className={btn("primary")}>
            {saving ? "Αποθήκευση…" : "Δημιουργία"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// ─────────────────────────────────────────────────────────────────
// Modal: Reset Password
// ─────────────────────────────────────────────────────────────────

function ResetPasswordModal({
  memberId,
  onClose,
  onReset,
  onError,
}: {
  memberId: string;
  onClose: () => void;
  onReset: () => void;
  onError: (msg: string) => void;
}) {
  const [password, setPassword] = useState(() => generatePassword());
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${memberId}/login`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = await res.json();
      if (!res.ok) {
        onError(body.error ?? "Σφάλμα αλλαγής password.");
        return;
      }
      onReset();
    } catch (err) {
      onError(errorMessage(err, "Σφάλμα αλλαγής password."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title="Επαναφορά Password" onClose={onClose} busy={saving}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium">Νέο Password</label>
          <div className="flex gap-2">
            <input
              type="text"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputCls + " font-mono"}
            />
            <button
              type="button"
              onClick={() => setPassword(generatePassword())}
              className={btn("ghost") + " shrink-0"}
            >
              Νέο
            </button>
          </div>
          <p className="mt-1 text-xs text-muted">
            Αντιγράψτε το password πριν κλείσετε — δεν αποθηκεύεται.
          </p>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className={btn("ghost")}
          >
            Ακύρωση
          </button>
          <button type="submit" disabled={saving} className={btn("primary")}>
            {saving ? "Αποθήκευση…" : "Αλλαγή Password"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// ─────────────────────────────────────────────────────────────────
// Modal: Add Role
// ─────────────────────────────────────────────────────────────────

function AddRoleModal({
  memberId,
  roles,
  onClose,
  onAdded,
  onError,
}: {
  memberId: string;
  roles: MemberRole[];
  onClose: () => void;
  onAdded: () => void;
  onError: (msg: string) => void;
}) {
  const [selectedRoleId, setSelectedRoleId] = useState(roles[0]?.id ?? "");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedRoleId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${memberId}/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roleId: selectedRoleId,
          notes: notes.trim() || null,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        onError(body.error ?? "Σφάλμα ανάθεσης ρόλου.");
        return;
      }
      onAdded();
    } catch (err) {
      onError(errorMessage(err, "Σφάλμα ανάθεσης ρόλου."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title="Προσθήκη Ρόλου" onClose={onClose} busy={saving}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium">Ρόλος</label>
          <select
            required
            value={selectedRoleId}
            onChange={(e) => setSelectedRoleId(e.target.value)}
            className={inputCls}
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">
            Σημείωση{" "}
            <span className="font-normal text-muted">(προαιρετική)</span>
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="π.χ. Αναπληρωτής"
            className={inputCls}
          />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className={btn("ghost")}
          >
            Ακύρωση
          </button>
          <button
            type="submit"
            disabled={saving || !selectedRoleId}
            className={btn("primary")}
          >
            {saving ? "Αποθήκευση…" : "Ανάθεση"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// ─────────────────────────────────────────────────────────────────
// Shared modal shell
// ─────────────────────────────────────────────────────────────────

function ModalShell({
  title,
  onClose,
  busy,
  children,
}: {
  title: string;
  onClose: () => void;
  busy: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded p-1 text-muted transition hover:bg-black/5 disabled:opacity-50"
            aria-label="Κλείσιμο"
          >
            ✕
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
