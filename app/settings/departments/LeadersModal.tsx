"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { formatMemberName } from "@/lib/utils/attendees";
import { normalizeGreek } from "@/lib/utils/greekSearch";
import type { Department } from "@/lib/supabase/types";

type MemberLite = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

type LeaderWithMember = {
  department_id: string;
  member_id: string;
  role: "leader" | "assistant";
  started_at: string;
  members: MemberLite;
};

type Props = {
  department: Department;
  clubId: string;
  onClose: () => void;
};

const ROLE_LABEL: Record<"leader" | "assistant", string> = {
  leader: "Ομαδάρχης",
  assistant: "Βοηθός",
};

export function LeadersModal({ department, clubId, onClose }: Props) {
  const [leaders, setLeaders] = useState<LeaderWithMember[]>([]);
  const [allMembers, setAllMembers] = useState<MemberLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add form state
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<"leader" | "assistant">(
    "leader"
  );
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Inline action state
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  // ─── Load leaders + members ────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch leaders (server-gated)
      const leadersRes = await fetch(
        `/api/admin/departments/${department.id}/leaders`
      );
      const leadersData = await leadersRes.json();
      if (!leadersRes.ok) {
        throw new Error(leadersData.error ?? `HTTP ${leadersRes.status}`);
      }

      // Fetch all members of the club (για member picker)
      const supabase = getBrowserClient();
      const membersRes = await supabase
        .from("members")
        .select("id, first_name, last_name, email")
        .eq("club_id", clubId)
        .order("last_name", { ascending: true });

      if (membersRes.error) {
        throw new Error(membersRes.error.message);
      }

      setLeaders(leadersData.leaders ?? []);
      setAllMembers((membersRes.data ?? []) as MemberLite[]);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Αποτυχία φόρτωσης ομαδαρχών"
      );
    } finally {
      setLoading(false);
    }
  }, [department.id, clubId]);

  useEffect(() => {
    void load();
  }, [load]);

  // ─── Filter members για picker (excluding existing leaders) ────
  const existingLeaderIds = useMemo(
    () => new Set(leaders.map((l) => l.member_id)),
    [leaders]
  );

  const filteredMembers = useMemo(() => {
    const q = normalizeGreek(memberSearch.trim().toLowerCase());
    if (!q) return [];
    return allMembers
      .filter((m) => !existingLeaderIds.has(m.id))
      .filter((m) => {
        const hay = normalizeGreek(
          formatMemberName(m).toLowerCase()
        );
        return hay.includes(q);
      })
      .slice(0, 8);
  }, [allMembers, memberSearch, existingLeaderIds]);

  // ─── Add leader ────────────────────────────────────────────────
  async function handleAdd() {
    if (!selectedMemberId) {
      setAddError("Επιλέξτε μέλος");
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch(
        `/api/admin/departments/${department.id}/leaders`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            member_id: selectedMemberId,
            role: selectedRole,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      // Reset form + reload
      setMemberSearch("");
      setSelectedMemberId(null);
      setSelectedRole("leader");
      await load();
    } catch (e) {
      setAddError(
        e instanceof Error ? e.message : "Αποτυχία προσθήκης"
      );
    } finally {
      setAdding(false);
    }
  }

  // ─── Change role (PATCH) ───────────────────────────────────────
  async function handleRoleChange(
    memberId: string,
    newRole: "leader" | "assistant"
  ) {
    setRowBusy(memberId);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/departments/${department.id}/leaders/${memberId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: newRole }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Αποτυχία αλλαγής ρόλου"
      );
    } finally {
      setRowBusy(null);
    }
  }

  // ─── Remove leader ─────────────────────────────────────────────
  async function handleRemove(memberId: string) {
    const member = leaders.find((l) => l.member_id === memberId);
    const name = member
      ? formatMemberName(member.members)
      : "αυτό το μέλος";
    if (!confirm(`Αφαίρεση του ${name} από τους ομαδάρχες;`)) return;

    setRowBusy(memberId);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/departments/${department.id}/leaders/${memberId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Αποτυχία αφαίρεσης"
      );
    } finally {
      setRowBusy(null);
    }
  }

  // ─── Render ────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-xl font-semibold">
          Ομαδάρχες — {department.name}
        </h2>

        {/* ─── Add section ─── */}
        <div className="mb-6 rounded border border-slate-200 bg-slate-50 p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-700">
            ➕ Προσθήκη ομαδάρχη
          </h3>

          <div className="relative mb-2">
            <input
              type="text"
              value={memberSearch}
              onChange={(e) => {
                setMemberSearch(e.target.value);
                setSelectedMemberId(null);
              }}
              placeholder="Αναζήτηση μέλους..."
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              disabled={adding}
            />
            {filteredMembers.length > 0 && !selectedMemberId && (
              <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded border border-slate-300 bg-white shadow-lg">
                {filteredMembers.map((m) => (
                  <li
                    key={m.id}
                    onClick={() => {
                      setSelectedMemberId(m.id);
                      setMemberSearch(
                        formatMemberName(m)
                      );
                    }}
                    className="cursor-pointer px-3 py-2 text-sm hover:bg-slate-100"
                  >
                    {formatMemberName(m)}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedRole}
              onChange={(e) =>
                setSelectedRole(e.target.value as "leader" | "assistant")
              }
              disabled={adding}
              className="rounded border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="leader">Ομαδάρχης</option>
              <option value="assistant">Βοηθός</option>
            </select>
            <button
              type="button"
              onClick={handleAdd}
              disabled={adding || !selectedMemberId}
              className="rounded bg-[#800000] px-4 py-2 text-sm text-white hover:bg-[#660000] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {adding ? "Προσθήκη..." : "Προσθήκη"}
            </button>
          </div>

          {addError && (
            <p className="mt-2 text-sm text-red-600">{addError}</p>
          )}
        </div>

        {/* ─── Current leaders list ─── */}
        <div className="mb-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-700">
            Τρέχοντες ομαδάρχες ({leaders.length})
          </h3>

          {loading ? (
            <p className="text-sm text-slate-500">Φόρτωση...</p>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : leaders.length === 0 ? (
            <p className="text-sm text-slate-500">
              Δεν υπάρχουν ομαδάρχες ακόμα.
            </p>
          ) : (
            <ul className="divide-y divide-slate-200 rounded border border-slate-200">
              {leaders.map((leader) => (
                <li
                  key={leader.member_id}
                  className="flex items-center justify-between px-3 py-2"
                >
                  <span className="text-sm">
                    {formatMemberName(leader.members)}
                  </span>
                  <div className="flex items-center gap-2">
                    <select
                      value={leader.role}
                      onChange={(e) =>
                        handleRoleChange(
                          leader.member_id,
                          e.target.value as "leader" | "assistant"
                        )
                      }
                      disabled={rowBusy === leader.member_id}
                      className="rounded border border-slate-300 px-2 py-1 text-xs"
                    >
                      <option value="leader">Ομαδάρχης</option>
                      <option value="assistant">Βοηθός</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => handleRemove(leader.member_id)}
                      disabled={rowBusy === leader.member_id}
                      className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                      aria-label={`Αφαίρεση ${formatMemberName(leader.members)}`}
                    >
                      🗑
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ─── Footer ─── */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
          >
            Κλείσιμο
          </button>
        </div>
      </div>
    </div>
  );
}
