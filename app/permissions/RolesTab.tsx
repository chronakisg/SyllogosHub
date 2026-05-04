"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PermissionMatrix,
  buildEmptyMatrix,
  rowsToMatrix,
  type MatrixState,
} from "@/components/PermissionMatrix";

type RoleListItem = {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  display_order: number;
  member_count: number;
  permission_count: number;
};

export function RolesTab({ clubId: _clubId }: { clubId: string }) {
  const [roles, setRoles] = useState<RoleListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [matrix, setMatrix] = useState<MatrixState>(buildEmptyMatrix);
  const [listLoading, setListLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const selectedRole = useMemo(
    () => roles.find((r) => r.id === selectedId) ?? null,
    [roles, selectedId]
  );

  const loadRoles = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await fetch("/api/admin/roles");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRoles(data.roles ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Αποτυχία φόρτωσης ρόλων.");
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRoles();
  }, [loadRoles]);

  const loadPermissions = useCallback(async (roleId: string) => {
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/admin/roles/${roleId}/permissions`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setMatrix(rowsToMatrix(data.permissions ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Αποτυχία φόρτωσης δικαιωμάτων.");
      setMatrix(buildEmptyMatrix());
    }
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setMatrix(buildEmptyMatrix());
      return;
    }
    void loadPermissions(selectedId);
  }, [selectedId, loadPermissions]);

  async function handleSave() {
    if (!selectedId) return;
    setSaving(true);
    setError(null);
    setInfo(null);

    const permissions: Array<{
      module: string;
      action: string;
      scope: string;
      scope_value: string | null;
    }> = [];

    matrix.forEach((cell, key) => {
      if (!cell.enabled) return;
      const [module, action] = key.split(":");
      permissions.push({
        module,
        action,
        scope: cell.scope,
        scope_value: cell.scope === "department" ? cell.scope_value : null,
      });
    });

    try {
      const res = await fetch(`/api/admin/roles/${selectedId}/permissions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setInfo(`Αποθηκεύτηκαν ${data.count} δικαιώματα.`);
      await loadRoles();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Αποτυχία αποθήκευσης.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(role: RoleListItem) {
    if (role.is_system) return;
    if (
      !confirm(
        `Διαγραφή ρόλου «${role.name}»;\n\nΑυτή η ενέργεια δεν αναιρείται.`
      )
    )
      return;

    setError(null);
    try {
      const res = await fetch(`/api/admin/roles/${role.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setInfo(`Διαγράφηκε: ${data.deleted}`);
      if (selectedId === role.id) setSelectedId(null);
      await loadRoles();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Αποτυχία διαγραφής.");
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
      {/* ── Left: roles list ── */}
      <aside className="rounded-xl border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Ρόλοι
          </span>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="rounded-md bg-accent px-2 py-1 text-xs font-medium text-white transition hover:opacity-90"
          >
            + Νέος
          </button>
        </div>

        {listLoading ? (
          <p className="p-4 text-sm text-muted">Φόρτωση…</p>
        ) : (
          <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto">
            {roles.map((r) => {
              const active = r.id === selectedId;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(r.id)}
                    className={
                      "group flex w-full items-start justify-between gap-2 px-3 py-2 text-left text-sm transition " +
                      (active
                        ? "bg-accent/10 text-accent"
                        : "hover:bg-foreground/5")
                    }
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium truncate">{r.name}</span>
                        {r.is_system && (
                          <span className="shrink-0 rounded bg-foreground/8 px-1 py-0.5 text-[10px] text-muted">
                            Σύστημα
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted">
                        {r.member_count} μέλη · {r.permission_count} permissions
                      </div>
                    </div>
                    {!r.is_system && (
                      <span
                        role="button"
                        tabIndex={-1}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDelete(r);
                        }}
                        className="shrink-0 rounded p-0.5 text-xs text-muted opacity-0 transition hover:text-danger group-hover:opacity-100"
                        aria-label={`Διαγραφή ${r.name}`}
                      >
                        ✕
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      {/* ── Right: matrix ── */}
      <section className="rounded-xl border border-border bg-surface p-4">
        {!selectedRole ? (
          <p className="py-16 text-center text-sm text-muted">
            Επιλέξτε ρόλο για να επεξεργαστείτε τα δικαιώματά του.
          </p>
        ) : (
          <>
            {error && (
              <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
                {error}
              </div>
            )}
            {info && (
              <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
                {info}
              </div>
            )}

            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold">{selectedRole.name}</h2>
                  {selectedRole.is_system && (
                    <span className="rounded bg-foreground/8 px-1.5 py-0.5 text-[11px] text-muted">
                      Default σύστηματος
                    </span>
                  )}
                </div>
                {selectedRole.description && (
                  <p className="mt-0.5 text-xs text-muted">
                    {selectedRole.description}
                  </p>
                )}
                <p className="mt-1 text-[11px] text-muted">
                  {selectedRole.member_count} ανατεθειμένα μέλη
                </p>
              </div>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Αποθήκευση…" : "Αποθήκευση"}
              </button>
            </div>

            <PermissionMatrix matrix={matrix} onChange={setMatrix} />
          </>
        )}
      </section>

      {/* ── Create modal ── */}
      {showCreateModal && (
        <CreateRoleModal
          onCancel={() => setShowCreateModal(false)}
          onCreate={async (name, description) => {
            setError(null);
            try {
              const res = await fetch("/api/admin/roles", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, description }),
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
              setShowCreateModal(false);
              setInfo(`Δημιουργήθηκε: ${data.role.name}`);
              await loadRoles();
              setSelectedId(data.role.id);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Αποτυχία δημιουργίας.");
            }
          }}
        />
      )}
    </div>
  );
}

function CreateRoleModal({
  onCancel,
  onCreate,
}: {
  onCancel: () => void;
  onCreate: (name: string, description: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const inputCls =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [submitting, onCancel]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2 || submitting) return;
    setSubmitting(true);
    await onCreate(name.trim(), description.trim());
    setSubmitting(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => {
        if (!submitting) onCancel();
      }}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-base font-semibold">Νέος Ρόλος</h2>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded p-1 text-muted transition hover:bg-black/5 disabled:opacity-50"
            aria-label="Κλείσιμο"
          >
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 px-5 py-4">
          <div>
            <label className="mb-1 block text-xs font-medium">Όνομα</label>
            <input
              type="text"
              required
              autoFocus
              minLength={2}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="π.χ. Υπεύθυνος Χορού"
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">
              Περιγραφή{" "}
              <span className="font-normal text-muted">(προαιρετική)</span>
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Σύντομη περιγραφή του ρόλου…"
              className={inputCls + " resize-none"}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="rounded-lg border border-border px-3 py-1.5 text-sm transition hover:bg-foreground/5 disabled:opacity-50"
            >
              Ακύρωση
            </button>
            <button
              type="submit"
              disabled={submitting || name.trim().length < 2}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? "Δημιουργία…" : "Δημιουργία"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
