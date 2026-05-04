"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { errorMessage, getBrowserClient } from "@/lib/supabase/client";
import type {
  Member,
  MemberPermission,
  MemberPermissionInsert,
} from "@/lib/supabase/types";
import {
  buildEmptyMatrix,
  rowsToMatrix,
  cellKey,
  MODULES,
  ACTIONS,
  PermissionMatrix,
  type MatrixState,
} from "@/components/PermissionMatrix";

export function MembersTab({ clubId }: { clubId: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [matrix, setMatrix] = useState<MatrixState>(buildEmptyMatrix);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
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
  }, [clubId]);

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

  async function handleSave() {
    if (!selectedId) return;
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
          scope_value:
            cell.scope === "department" ? cell.scope_value.trim() : null,
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

  return (
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
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
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
              <PermissionMatrix matrix={matrix} onChange={setMatrix} />
            </>
          )}
        </section>
      </div>
    </>
  );
}

function memberBadge(m: Member): ReactNode {
  if (m.is_system_admin) return "Διαχειριστής";
  if (m.is_president) return "Πρόεδρος";
  if (m.board_position) return m.board_position;
  if (m.is_board_member) return "Δ.Σ.";
  return m.email ?? "Μέλος";
}
