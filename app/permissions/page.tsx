"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { errorMessage, getBrowserClient } from "@/lib/supabase/client";
import { useRole } from "@/lib/hooks/useRole";
import { useCurrentClub } from "@/lib/hooks/useCurrentClub";
import { AccessDenied } from "@/lib/auth/AccessDenied";
import type {
  Member,
  MemberPermission,
  MemberPermissionInsert,
  PermissionAction,
  PermissionModule,
  PermissionScope,
} from "@/lib/supabase/types";

const MODULES: Array<{ id: PermissionModule; label: string }> = [
  { id: "calendar", label: "Ημερολόγιο" },
  { id: "members", label: "Μέλη" },
  { id: "finances", label: "Οικονομικά" },
  { id: "seating", label: "Πλάνο Τραπεζιών" },
  { id: "events", label: "Εκδηλώσεις" },
  { id: "dashboard", label: "Dashboard" },
  { id: "settings", label: "Ρυθμίσεις" },
];

const ACTIONS: Array<{ id: PermissionAction; label: string }> = [
  { id: "read", label: "Ανάγνωση" },
  { id: "create", label: "Δημιουργία" },
  { id: "edit", label: "Επεξεργασία" },
  { id: "delete", label: "Διαγραφή" },
];

type CellState = {
  enabled: boolean;
  scope: PermissionScope;
  scope_value: string;
};

const EMPTY_CELL: CellState = {
  enabled: false,
  scope: "all",
  scope_value: "",
};

type CellKey = `${PermissionModule}:${PermissionAction}`;

function cellKey(module: PermissionModule, action: PermissionAction): CellKey {
  return `${module}:${action}` as CellKey;
}

function buildEmptyMatrix(): Map<CellKey, CellState> {
  const map = new Map<CellKey, CellState>();
  for (const m of MODULES) {
    for (const a of ACTIONS) {
      map.set(cellKey(m.id, a.id), { ...EMPTY_CELL });
    }
  }
  return map;
}

function rowsToMatrix(rows: MemberPermission[]): Map<CellKey, CellState> {
  const map = buildEmptyMatrix();
  for (const r of rows) {
    map.set(cellKey(r.module, r.action), {
      enabled: true,
      scope: r.scope,
      scope_value: r.scope_value ?? "",
    });
  }
  return map;
}

const inputClass =
  "w-full rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

export default function PermissionsPage() {
  const role = useRole();
  const { clubId } = useCurrentClub();
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [matrix, setMatrix] = useState<Map<CellKey, CellState>>(
    buildEmptyMatrix
  );
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const isPrivileged = role.isSystemAdmin || role.isPresident;

  useEffect(() => {
    if (role.loading || !isPrivileged || !clubId) return;
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
          setError(errorMessage(err, "Σφάλμα φόρτωσης μελών."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [role.loading, isPrivileged, clubId]);

  const loadMatrix = useCallback(async (memberId: string) => {
    setError(null);
    setInfo(null);
    try {
      const supabase = getBrowserClient();
      const { data, error: qErr } = await supabase
        .from("member_permissions")
        .select("*")
        .eq("member_id", memberId);
      if (qErr) throw qErr;
      setMatrix(rowsToMatrix((data ?? []) as MemberPermission[]));
    } catch (err) {
      setError(errorMessage(err, "Σφάλμα φόρτωσης δικαιωμάτων."));
      setMatrix(buildEmptyMatrix());
    }
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setMatrix(buildEmptyMatrix());
      return;
    }
    void loadMatrix(selectedId);
  }, [selectedId, loadMatrix]);

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) =>
      `${m.last_name} ${m.first_name} ${m.email ?? ""}`
        .toLowerCase()
        .includes(q)
    );
  }, [members, search]);

  const selected = useMemo(
    () => members.find((m) => m.id === selectedId) ?? null,
    [members, selectedId]
  );

  function updateCell(
    module: PermissionModule,
    action: PermissionAction,
    patch: Partial<CellState>
  ) {
    setMatrix((prev) => {
      const next = new Map(prev);
      const k = cellKey(module, action);
      const current = next.get(k) ?? { ...EMPTY_CELL };
      next.set(k, { ...current, ...patch });
      return next;
    });
  }

  async function handleSave() {
    if (!selectedId) return;
    if (!clubId) {
      setError("Δεν έχει εντοπιστεί σύλλογος.");
      return;
    }
    setError(null);
    setInfo(null);

    const inserts: MemberPermissionInsert[] = [];
    for (const m of MODULES) {
      for (const a of ACTIONS) {
        const cell = matrix.get(cellKey(m.id, a.id));
        if (!cell || !cell.enabled) continue;
        if (cell.scope === "department" && !cell.scope_value.trim()) {
          setError(
            `Το «${m.label} → ${a.label}» έχει scope «τμήμα» αλλά λείπει το όνομα τμήματος.`
          );
          return;
        }
        inserts.push({
          club_id: clubId,
          member_id: selectedId,
          module: m.id,
          action: a.id,
          scope: cell.scope,
          scope_value: cell.scope === "department" ? cell.scope_value.trim() : null,
        });
      }
    }

    setSaving(true);
    try {
      const supabase = getBrowserClient();
      const { error: dErr } = await supabase
        .from("member_permissions")
        .delete()
        .eq("member_id", selectedId);
      if (dErr) throw dErr;
      if (inserts.length > 0) {
        const { error: iErr } = await supabase
          .from("member_permissions")
          .insert(inserts);
        if (iErr) throw iErr;
      }
      setInfo("Τα δικαιώματα αποθηκεύτηκαν.");
      await loadMatrix(selectedId);
    } catch (err) {
      setError(errorMessage(err, "Σφάλμα αποθήκευσης."));
    } finally {
      setSaving(false);
    }
  }

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
    <div className="mx-auto w-full max-w-6xl">
      <header className="mb-3">
        <h1 className="text-xl font-semibold tracking-tight">
          Δικαιώματα Μελών
        </h1>
      </header>

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

      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
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
          {loading ? (
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
                      <span className="font-medium">
                        {m.last_name} {m.first_name}
                      </span>
                      <span className="text-[11px] text-muted">
                        {memberBadge(m)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <section className="rounded-xl border border-border bg-surface p-4">
          {!selected ? (
            <p className="p-6 text-center text-sm text-muted">
              Επιλέξτε ένα μέλος για να επεξεργαστείτε τα δικαιώματά του.
            </p>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">
                    {selected.last_name} {selected.first_name}
                  </h2>
                  <p className="text-xs text-muted">{memberBadge(selected)}</p>
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

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border bg-background/50 text-xs uppercase tracking-wider text-muted">
                    <tr>
                      <th className="px-3 py-2">Ενότητα</th>
                      {ACTIONS.map((a) => (
                        <th key={a.id} className="px-3 py-2 text-center">
                          {a.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {MODULES.map((mod) => (
                      <tr key={mod.id}>
                        <td className="px-3 py-2 font-medium">{mod.label}</td>
                        {ACTIONS.map((a) => {
                          const cell =
                            matrix.get(cellKey(mod.id, a.id)) ?? EMPTY_CELL;
                          return (
                            <td
                              key={a.id}
                              className="px-3 py-2 align-top text-center"
                            >
                              <CellEditor
                                cell={cell}
                                onChange={(patch) =>
                                  updateCell(mod.id, a.id, patch)
                                }
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="mt-3 text-[11px] text-muted">
                Scope: <strong>Όλα</strong> = πρόσβαση παντού,{" "}
                <strong>Δικά μου</strong> = μόνο records που του ανήκουν,{" "}
                <strong>Τμήμα</strong> = μόνο records του συγκεκριμένου
                τμήματος (συμπληρώστε όνομα).
              </p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function CellEditor({
  cell,
  onChange,
}: {
  cell: CellState;
  onChange: (patch: Partial<CellState>) => void;
}) {
  return (
    <div className="flex flex-col items-stretch gap-1">
      <label className="flex items-center justify-center gap-1">
        <input
          type="checkbox"
          checked={cell.enabled}
          onChange={(e) => onChange({ enabled: e.target.checked })}
          className="h-4 w-4 rounded border-border"
        />
      </label>
      {cell.enabled && (
        <>
          <select
            value={cell.scope}
            onChange={(e) =>
              onChange({ scope: e.target.value as PermissionScope })
            }
            className={inputClass}
          >
            <option value="all">Όλα</option>
            <option value="own">Δικά μου</option>
            <option value="department">Τμήμα</option>
          </select>
          {cell.scope === "department" && (
            <input
              type="text"
              value={cell.scope_value}
              onChange={(e) => onChange({ scope_value: e.target.value })}
              placeholder="π.χ. Χορευτικό"
              className={inputClass}
            />
          )}
        </>
      )}
    </div>
  );
}

function memberBadge(m: Member): ReactNode {
  if (m.is_system_admin) return "Διαχειριστής";
  if (m.is_president) return "Πρόεδρος";
  if (m.board_position) return m.board_position;
  if (m.is_board_member) return "Δ.Σ.";
  return m.email ?? "Μέλος";
}
