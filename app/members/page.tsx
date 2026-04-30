"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { errorMessage, getBrowserClient } from "@/lib/supabase/client";
import { useRole } from "@/lib/hooks/useRole";
import { useCurrentClub } from "@/lib/hooks/useCurrentClub";
import { AccessDenied } from "@/lib/auth/AccessDenied";
import { calculateAge, generateUuid } from "@/lib/utils/discounts";
import {
  BOARD_POSITIONS,
  DEPARTMENT_ROLE_LABELS,
  type Department,
  type DepartmentRole,
  type Member,
  type MemberInsert,
  type MemberStatus,
  type MemberUpdate,
} from "@/lib/supabase/types";

type MemberDeptAssignment = {
  department_id: string;
  name: string;
  role: DepartmentRole;
};

type MemberWithDepartments = Member & {
  departments: MemberDeptAssignment[];
};

type FamilyMode = "none" | "new" | "link";

type FormDeptSelection = {
  department_id: string;
  role: DepartmentRole;
};

type FormState = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  status: MemberStatus;
  is_board_member: boolean;
  board_position: string;
  is_president: boolean;
  departments: FormDeptSelection[];
  birth_date: string;
  family_mode: FamilyMode;
  family_id: string | null;
  link_member_id: string;
};

const EMPTY_FORM: FormState = {
  first_name: "",
  last_name: "",
  phone: "",
  email: "",
  status: "active",
  is_board_member: false,
  board_position: "",
  is_president: false,
  departments: [],
  birth_date: "",
  family_mode: "none",
  family_id: null,
  link_member_id: "",
};

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

function displayName(m: { first_name: string; last_name: string }): string {
  return `${m.last_name} ${m.first_name}`.trim();
}

export default function MembersPage() {
  const role = useRole();
  const { clubId, loading: clubLoading } = useCurrentClub();
  const [members, setMembers] = useState<MemberWithDepartments[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"all" | MemberStatus>("all");
  const [boardOnly, setBoardOnly] = useState(false);
  const [ageFilter, setAgeFilter] = useState<"all" | "child" | "adult">("all");
  const [familyOnly, setFamilyOnly] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MemberWithDepartments | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    if (!clubId) return;
    try {
      const supabase = getBrowserClient();
      const [mRes, mdRes, depRes] = await Promise.all([
        supabase
          .from("members")
          .select("*")
          .eq("club_id", clubId)
          .order("last_name", { ascending: true })
          .order("first_name", { ascending: true }),
        supabase
          .from("member_departments")
          .select("*")
          .eq("club_id", clubId),
        supabase
          .from("departments")
          .select("*")
          .eq("club_id", clubId)
          .order("display_order", { ascending: true })
          .order("name", { ascending: true }),
      ]);
      if (mRes.error) throw mRes.error;
      if (mdRes.error) throw mdRes.error;
      if (depRes.error) throw depRes.error;

      const allDepartments = (depRes.data ?? []) as Department[];
      const deptById = new Map(allDepartments.map((d) => [d.id, d]));

      const byMember = new Map<string, MemberDeptAssignment[]>();
      for (const row of mdRes.data ?? []) {
        const dep = deptById.get(row.department_id);
        if (!dep) continue;
        const list = byMember.get(row.member_id) ?? [];
        list.push({
          department_id: dep.id,
          name: dep.name,
          role: row.role,
        });
        byMember.set(row.member_id, list);
      }
      const merged: MemberWithDepartments[] = (mRes.data ?? []).map((m) => ({
        ...m,
        departments: (byMember.get(m.id) ?? []).sort((a, b) =>
          a.name.localeCompare(b.name, "el")
        ),
      }));
      setError(null);
      setMembers(merged);
      setDepartments(allDepartments);
    } catch (err) {
      setError(errorMessage(err, "Σφάλμα φόρτωσης μελών."));
    } finally {
      setLoading(false);
    }
  }, [clubId]);

  useEffect(() => {
    if (clubLoading) return;
    loadMembers();
  }, [loadMembers, clubLoading]);

  const departmentOptions = useMemo(
    () =>
      [...departments].sort(
        (a, b) =>
          a.display_order - b.display_order ||
          a.name.localeCompare(b.name, "el")
      ),
    [departments]
  );

  const activeDepartmentOptions = useMemo(
    () => departmentOptions.filter((d) => d.active),
    [departmentOptions]
  );

  const familyCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of members) {
      if (x.family_id) m.set(x.family_id, (m.get(x.family_id) ?? 0) + 1);
    }
    return m;
  }, [members]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter((m) => {
      if (statusFilter !== "all" && m.status !== statusFilter) return false;
      if (boardOnly && !m.is_board_member) return false;
      if (familyOnly && !m.family_id) return false;
      if (ageFilter !== "all") {
        const age = calculateAge(m.birth_date);
        if (age == null) return false;
        if (ageFilter === "child" && age >= 18) return false;
        if (ageFilter === "adult" && age < 18) return false;
      }
      if (
        departmentFilter &&
        !m.departments.some((d) => d.department_id === departmentFilter)
      )
        return false;
      if (q) {
        const hay = [
          m.first_name,
          m.last_name,
          m.phone,
          m.email,
          m.board_position,
          ...m.departments.map((d) => d.name),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    members,
    search,
    statusFilter,
    boardOnly,
    familyOnly,
    ageFilter,
    departmentFilter,
  ]);

  function clearFilters() {
    setSearch("");
    setDepartmentFilter("");
    setStatusFilter("all");
    setBoardOnly(false);
    setAgeFilter("all");
    setFamilyOnly(false);
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(member: MemberWithDepartments) {
    setEditing(member);
    setForm({
      first_name: member.first_name,
      last_name: member.last_name,
      phone: member.phone ?? "",
      email: member.email ?? "",
      status: member.status,
      is_board_member: member.is_board_member,
      board_position: member.board_position ?? "",
      is_president: member.is_president,
      departments: member.departments.map((d) => ({
        department_id: d.department_id,
        role: d.role,
      })),
      birth_date: member.birth_date ?? "",
      family_mode: member.family_id ? "link" : "none",
      family_id: member.family_id,
      link_member_id: "",
    });
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setModalOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  async function syncDepartments(
    memberId: string,
    next: FormDeptSelection[]
  ) {
    if (!clubId) throw new Error("Δεν έχει εντοπιστεί σύλλογος.");
    const supabase = getBrowserClient();
    const { data: existing, error: exErr } = await supabase
      .from("member_departments")
      .select("id, department_id, role")
      .eq("member_id", memberId)
      .eq("club_id", clubId);
    if (exErr) throw exErr;

    const existingByDept = new Map(
      (existing ?? []).map((r) => [
        r.department_id,
        { id: r.id, role: r.role as DepartmentRole },
      ])
    );
    const nextByDept = new Map(next.map((n) => [n.department_id, n.role]));

    const toDelete: string[] = [];
    for (const [deptId, row] of existingByDept) {
      if (!nextByDept.has(deptId)) toDelete.push(row.id);
    }
    const toInsert: {
      club_id: string;
      member_id: string;
      department_id: string;
      role: DepartmentRole;
    }[] = [];
    const toUpdate: { id: string; role: DepartmentRole }[] = [];
    for (const [deptId, role] of nextByDept) {
      const ex = existingByDept.get(deptId);
      if (!ex) {
        toInsert.push({
          club_id: clubId,
          member_id: memberId,
          department_id: deptId,
          role,
        });
      } else if (ex.role !== role) {
        toUpdate.push({ id: ex.id, role });
      }
    }

    if (toDelete.length > 0) {
      const { error: dErr } = await supabase
        .from("member_departments")
        .delete()
        .in("id", toDelete);
      if (dErr) throw dErr;
    }
    if (toInsert.length > 0) {
      const { error: iErr } = await supabase
        .from("member_departments")
        .insert(toInsert);
      if (iErr) throw iErr;
    }
    for (const u of toUpdate) {
      const { error: uErr } = await supabase
        .from("member_departments")
        .update({ role: u.role })
        .eq("id", u.id)
        .eq("club_id", clubId);
      if (uErr) throw uErr;
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);

    const first_name = form.first_name.trim();
    const last_name = form.last_name.trim();
    if (!first_name || !last_name) {
      setFormError("Το όνομα και το επώνυμο είναι υποχρεωτικά.");
      return;
    }

    const isBoardMember = form.is_board_member || form.is_president;
    const boardPosition = form.is_president
      ? "Πρόεδρος"
      : isBoardMember
        ? form.board_position.trim() || null
        : null;

    if (!clubId) {
      setFormError("Δεν έχει εντοπιστεί σύλλογος.");
      return;
    }

    // Resolve family_id based on selected mode
    let resolvedFamilyId: string | null = null;
    if (form.family_mode === "new") {
      resolvedFamilyId = generateUuid();
    } else if (form.family_mode === "link") {
      if (!form.link_member_id) {
        setFormError("Επιλέξτε μέλος για σύνδεση οικογένειας.");
        return;
      }
      const target = members.find((m) => m.id === form.link_member_id);
      if (!target) {
        setFormError("Δεν βρέθηκε το επιλεγμένο μέλος.");
        return;
      }
      if (target.family_id) {
        resolvedFamilyId = target.family_id;
      } else {
        // Generate fresh family_id and update target as well
        resolvedFamilyId = generateUuid();
        const supabase = getBrowserClient();
        const { error: updErr } = await supabase
          .from("members")
          .update({ family_id: resolvedFamilyId })
          .eq("id", target.id)
          .eq("club_id", clubId);
        if (updErr) {
          setFormError(errorMessage(updErr, "Σφάλμα σύνδεσης οικογένειας."));
          return;
        }
      }
    }

    const payload = {
      first_name,
      last_name,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      status: form.status,
      is_board_member: isBoardMember,
      board_position: boardPosition,
      is_president: form.is_president,
      birth_date: form.birth_date || null,
      family_id: resolvedFamilyId,
    };

    setSaving(true);
    try {
      const supabase = getBrowserClient();
      let memberId: string;
      if (editing) {
        const update: MemberUpdate = payload;
        const { error: upErr } = await supabase
          .from("members")
          .update(update)
          .eq("id", editing.id)
          .eq("club_id", clubId);
        if (upErr) throw upErr;
        memberId = editing.id;
      } else {
        const insert: MemberInsert = { ...payload, club_id: clubId };
        const { data, error: insErr } = await supabase
          .from("members")
          .insert(insert)
          .select("id")
          .single();
        if (insErr) throw insErr;
        memberId = data.id;
      }
      await syncDepartments(memberId, form.departments);
      setModalOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      await loadMembers();
    } catch (err) {
      setFormError(errorMessage(err, "Σφάλμα αποθήκευσης."));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(member: MemberWithDepartments) {
    const confirmed = window.confirm(
      `Διαγραφή του μέλους "${displayName(member)}"; Η ενέργεια δεν αναιρείται.`
    );
    if (!confirmed || !clubId) return;
    try {
      const supabase = getBrowserClient();
      const { error: delErr } = await supabase
        .from("members")
        .delete()
        .eq("id", member.id)
        .eq("club_id", clubId);
      if (delErr) throw delErr;
      await loadMembers();
    } catch (err) {
      setError(errorMessage(err, "Σφάλμα διαγραφής μέλους."));
    }
  }

  function exportToExcel() {
    const rows = filtered.map((m) => ({
      Επώνυμο: m.last_name,
      Όνομα: m.first_name,
      Τηλέφωνο: m.phone ?? "",
      Email: m.email ?? "",
      Τμήματα: m.departments
        .map((d) =>
          d.role === "member"
            ? d.name
            : `${d.name} (${DEPARTMENT_ROLE_LABELS[d.role]})`
        )
        .join(", "),
      Κατάσταση: m.status === "active" ? "Ενεργό" : "Ανενεργό",
      "Δ.Σ.": m.is_board_member ? "Ναι" : "Όχι",
      Θέση: m.board_position ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Μέλη");
    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `members-${stamp}.xlsx`);
  }

  const filtersActive =
    !!search ||
    !!departmentFilter ||
    statusFilter !== "all" ||
    boardOnly ||
    ageFilter !== "all" ||
    familyOnly;

  if (role.loading) {
    return (
      <div className="mx-auto w-full max-w-6xl p-10 text-center text-muted">
        Φόρτωση…
      </div>
    );
  }
  if (role.userId && !role.permissions.includes("members")) {
    return <AccessDenied />;
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">Μέλη</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Διαχείριση Μελών
          </h1>
          <p className="mt-1 text-sm text-muted">
            Προσθέστε, αναζητήστε και επεξεργαστείτε τα μέλη του συλλόγου.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exportToExcel}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm transition hover:bg-background disabled:opacity-50"
          >
            Εξαγωγή Excel
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90"
          >
            + Νέο Μέλος
          </button>
        </div>
      </header>

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-3">
        <div className="min-w-[14rem] flex-1">
          <label className="mb-1 block text-xs font-medium text-muted">
            Αναζήτηση
          </label>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Όνομα, τηλέφωνο, email…"
            className={inputClass}
          />
        </div>
        <div className="min-w-[10rem]">
          <label className="mb-1 block text-xs font-medium text-muted">
            Τμήμα
          </label>
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className={inputClass}
          >
            <option value="">— Όλα —</option>
            {departmentOptions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[9rem]">
          <label className="mb-1 block text-xs font-medium text-muted">
            Κατάσταση
          </label>
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as "all" | MemberStatus)
            }
            className={inputClass}
          >
            <option value="all">Όλες</option>
            <option value="active">Ενεργά</option>
            <option value="inactive">Ανενεργά</option>
          </select>
        </div>
        <div className="min-w-[10rem]">
          <label className="mb-1 block text-xs font-medium text-muted">
            Ηλικιακή κατηγορία
          </label>
          <select
            value={ageFilter}
            onChange={(e) =>
              setAgeFilter(e.target.value as "all" | "child" | "adult")
            }
            className={inputClass}
          >
            <option value="all">Όλα</option>
            <option value="child">Παιδιά (&lt;18)</option>
            <option value="adult">Ενήλικες (18+)</option>
          </select>
        </div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input
            type="checkbox"
            checked={boardOnly}
            onChange={(e) => setBoardOnly(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Μόνο Δ.Σ.
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input
            type="checkbox"
            checked={familyOnly}
            onChange={(e) => setFamilyOnly(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Μόνο οικογένειες
        </label>
        <button
          type="button"
          onClick={clearFilters}
          disabled={!filtersActive}
          className="self-end rounded-lg border border-border px-3 py-2 text-sm transition hover:bg-background disabled:opacity-50"
        >
          Καθαρισμός φίλτρων
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-background/50 text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-3">Ονοματεπώνυμο</th>
                <th className="px-4 py-3">Ηλικία</th>
                <th className="px-4 py-3">Τηλέφωνο</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Τμήματα</th>
                <th className="px-4 py-3">Κατάσταση</th>
                <th className="px-4 py-3 text-right">Ενέργειες</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted">
                    Φόρτωση…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted">
                    {members.length === 0
                      ? "Δεν υπάρχουν ακόμη μέλη. Πατήστε «Νέο Μέλος» για να ξεκινήσετε."
                      : "Δεν βρέθηκαν αποτελέσματα για τα φίλτρα."}
                  </td>
                </tr>
              ) : (
                filtered.map((m) => (
                  <tr key={m.id} className="hover:bg-background/40">
                    <td className="px-4 py-3 font-medium">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{displayName(m)}</span>
                        {m.is_board_member && (
                          <span
                            title={m.board_position ?? "Μέλος Δ.Σ."}
                            className="rounded-full bg-slate-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300"
                          >
                            Δ.Σ.
                          </span>
                        )}
                        {m.is_president && (
                          <span
                            title="Πρόεδρος — πλήρης πρόσβαση"
                            className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400"
                          >
                            Πρόεδρος
                          </span>
                        )}
                        {m.family_id && (
                          <span
                            title={`Οικογένεια — ${familyCounts.get(m.family_id) ?? 1} μέλη`}
                            className="text-sm"
                            aria-label="Οικογένεια"
                          >
                            👪
                          </span>
                        )}
                      </div>
                      {m.is_board_member && m.board_position && !m.is_president && (
                        <p className="mt-0.5 text-[11px] text-muted">
                          {m.board_position}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {(() => {
                        const age = calculateAge(m.birth_date);
                        if (age == null) return "—";
                        return age < 18 ? `${age} (Παιδί)` : String(age);
                      })()}
                    </td>
                    <td className="px-4 py-3 text-muted">{m.phone ?? "—"}</td>
                    <td className="px-4 py-3 text-muted">{m.email ?? "—"}</td>
                    <td className="px-4 py-3">
                      {m.departments.length === 0 ? (
                        <span className="text-muted">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {m.departments.map((d) => (
                            <span
                              key={d.department_id}
                              className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] text-accent"
                            >
                              {d.name}
                              {d.role === "leader" && (
                                <span title="Ομαδάρχης" aria-label="Ομαδάρχης">
                                  · 🏅 Ομαδάρχης
                                </span>
                              )}
                              {d.role === "assistant" && (
                                <span title="Βοηθός" aria-label="Βοηθός">
                                  · 🤝 Βοηθός
                                </span>
                              )}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={m.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(m)}
                          className="rounded-md border border-border px-3 py-1 text-xs transition hover:bg-background"
                        >
                          Επεξεργασία
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(m)}
                          className="rounded-md border border-danger/30 px-3 py-1 text-xs text-danger transition hover:bg-danger/10"
                        >
                          Διαγραφή
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <MemberModal
          editing={editing}
          form={form}
          setForm={setForm}
          members={members}
          departments={activeDepartmentOptions}
          saving={saving}
          formError={formError}
          onClose={closeModal}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: MemberStatus }) {
  const isActive = status === "active";
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium " +
        (isActive
          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "bg-slate-500/10 text-slate-600 dark:text-slate-400")
      }
    >
      <span
        className={
          "h-1.5 w-1.5 rounded-full " +
          (isActive ? "bg-emerald-500" : "bg-slate-400")
        }
      />
      {isActive ? "Ενεργό" : "Ανενεργό"}
    </span>
  );
}

function MemberModal({
  editing,
  form,
  setForm,
  members,
  departments,
  saving,
  formError,
  onClose,
  onSubmit,
}: {
  editing: Member | null;
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  members: MemberWithDepartments[];
  departments: Department[];
  saving: boolean;
  formError: string | null;
  onClose: () => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  function toggleDepartment(deptId: string, checked: boolean) {
    setForm((s) =>
      checked
        ? {
            ...s,
            departments: [
              ...s.departments,
              { department_id: deptId, role: "member" },
            ],
          }
        : {
            ...s,
            departments: s.departments.filter(
              (x) => x.department_id !== deptId
            ),
          }
    );
  }
  function setDeptRole(deptId: string, role: DepartmentRole) {
    setForm((s) => ({
      ...s,
      departments: s.departments.map((x) =>
        x.department_id === deptId ? { ...x, role } : x
      ),
    }));
  }

  const [familySearch, setFamilySearch] = useState("");
  const [familySearchDebounced, setFamilySearchDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(
      () => setFamilySearchDebounced(familySearch.trim()),
      300
    );
    return () => clearTimeout(t);
  }, [familySearch]);

  const familyMatches = useMemo(() => {
    const q = familySearchDebounced.toLowerCase();
    if (!q) return [] as MemberWithDepartments[];
    return members
      .filter((m) => m.id !== editing?.id)
      .filter((m) =>
        `${m.last_name} ${m.first_name}`.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [members, familySearchDebounced, editing?.id]);

  const linkedTarget = useMemo(
    () =>
      form.link_member_id
        ? members.find((m) => m.id === form.link_member_id) ?? null
        : null,
    [members, form.link_member_id]
  );

  const linkedFamilySize = useMemo(() => {
    if (!linkedTarget?.family_id) return 0;
    return members.filter((m) => m.family_id === linkedTarget.family_id).length;
  }, [members, linkedTarget]);

  const age = calculateAge(form.birth_date || null);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4">
          <h2 className="text-lg font-semibold">
            {editing ? "Επεξεργασία Μέλους" : "Νέο Μέλος"}
          </h2>
          <p className="text-sm text-muted">
            Συμπληρώστε τα στοιχεία του μέλους.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Επώνυμο" required>
              <input
                type="text"
                required
                value={form.last_name}
                onChange={(e) =>
                  setForm((s) => ({ ...s, last_name: e.target.value }))
                }
                className={inputClass}
              />
            </Field>
            <Field label="Όνομα" required>
              <input
                type="text"
                required
                value={form.first_name}
                onChange={(e) =>
                  setForm((s) => ({ ...s, first_name: e.target.value }))
                }
                className={inputClass}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Τηλέφωνο">
              <input
                type="tel"
                value={form.phone}
                onChange={(e) =>
                  setForm((s) => ({ ...s, phone: e.target.value }))
                }
                className={inputClass}
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm((s) => ({ ...s, email: e.target.value }))
                }
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Ημερομηνία Γέννησης">
            <div className="flex items-center gap-2">
              <input
                type="date"
                lang="el"
                value={form.birth_date}
                onChange={(e) =>
                  setForm((s) => ({ ...s, birth_date: e.target.value }))
                }
                className={inputClass}
              />
              {age != null && (
                <span className="shrink-0 text-xs text-muted">
                  ({age} ετών)
                </span>
              )}
            </div>
          </Field>

          <fieldset className="rounded-lg border border-border p-3">
            <legend className="px-2 text-xs font-semibold uppercase tracking-wider text-muted">
              Οικογένεια
            </legend>
            <div className="space-y-2 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="family_mode"
                  checked={form.family_mode === "none"}
                  onChange={() =>
                    setForm((s) => ({
                      ...s,
                      family_mode: "none",
                      family_id: null,
                      link_member_id: "",
                    }))
                  }
                  className="h-4 w-4"
                />
                Χωρίς οικογένεια
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="family_mode"
                  checked={form.family_mode === "new"}
                  onChange={() =>
                    setForm((s) => ({
                      ...s,
                      family_mode: "new",
                      family_id: null,
                      link_member_id: "",
                    }))
                  }
                  className="h-4 w-4"
                />
                Νέα οικογένεια
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="family_mode"
                  checked={form.family_mode === "link"}
                  onChange={() =>
                    setForm((s) => ({ ...s, family_mode: "link" }))
                  }
                  className="h-4 w-4"
                />
                Σύνδεση με υπάρχον μέλος
              </label>

              {form.family_mode === "link" && (
                <div className="mt-2 space-y-2">
                  <input
                    type="search"
                    value={familySearch}
                    onChange={(e) => setFamilySearch(e.target.value)}
                    placeholder="Αναζήτηση μέλους…"
                    className={inputClass}
                  />
                  {familySearchDebounced && familyMatches.length > 0 && (
                    <ul className="max-h-40 overflow-y-auto rounded-lg border border-border">
                      {familyMatches.map((m) => (
                        <li key={m.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setForm((s) => ({
                                ...s,
                                link_member_id: m.id,
                              }));
                              setFamilySearch("");
                              setFamilySearchDebounced("");
                            }}
                            className="block w-full px-3 py-2 text-left text-sm hover:bg-foreground/5"
                          >
                            {m.last_name} {m.first_name}
                            {m.family_id && (
                              <span className="ml-2 text-[10px] text-muted">
                                (ήδη σε οικογένεια)
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {linkedTarget && (
                    <p className="rounded-md border border-accent/30 bg-accent/10 p-2 text-xs text-accent">
                      Θα συνδεθεί με: {linkedTarget.last_name}{" "}
                      {linkedTarget.first_name}
                      {linkedFamilySize > 1
                        ? ` και ${linkedFamilySize - 1} άλλα μέλη`
                        : ""}
                    </p>
                  )}
                </div>
              )}
            </div>
          </fieldset>

          <Field label="Τμήματα">
            {departments.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-background/40 p-3 text-xs text-muted">
                <p>Ο σύλλογος δεν έχει ορίσει τμήματα ακόμα.</p>
                <Link
                  href="/settings/departments"
                  className="mt-1 inline-flex font-medium text-accent hover:underline"
                >
                  Προσθήκη Τμημάτων →
                </Link>
              </div>
            ) : (
              <div className="space-y-1.5 rounded-lg border border-border p-3">
                {departments.map((d) => {
                  const sel = form.departments.find(
                    (x) => x.department_id === d.id
                  );
                  const checked = !!sel;
                  return (
                    <div
                      key={d.id}
                      className="flex flex-wrap items-center gap-3"
                    >
                      <label className="flex flex-1 items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            toggleDepartment(d.id, e.target.checked)
                          }
                          className="h-4 w-4 rounded border-border"
                        />
                        {d.name}
                      </label>
                      {checked && (
                        <label className="flex items-center gap-2 text-xs text-muted">
                          Ρόλος:
                          <select
                            value={sel.role}
                            onChange={(e) =>
                              setDeptRole(
                                d.id,
                                e.target.value as DepartmentRole
                              )
                            }
                            className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                          >
                            <option value="member">
                              {DEPARTMENT_ROLE_LABELS.member}
                            </option>
                            <option value="leader">
                              {DEPARTMENT_ROLE_LABELS.leader}
                            </option>
                            <option value="assistant">
                              {DEPARTMENT_ROLE_LABELS.assistant}
                            </option>
                          </select>
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Field>

          <Field label="Κατάσταση">
            <select
              value={form.status}
              onChange={(e) =>
                setForm((s) => ({
                  ...s,
                  status: e.target.value as MemberStatus,
                }))
              }
              className={inputClass}
            >
              <option value="active">Ενεργό</option>
              <option value="inactive">Ανενεργό</option>
            </select>
          </Field>

          <div className="space-y-3 rounded-lg border border-border p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_board_member || form.is_president}
                  disabled={form.is_president}
                  onChange={(e) =>
                    setForm((s) => ({
                      ...s,
                      is_board_member: e.target.checked,
                      board_position: e.target.checked ? s.board_position : "",
                    }))
                  }
                  className="mt-0.5 h-4 w-4 rounded border-border"
                />
                <span>
                  <span className="font-medium">Μέλος Δ.Σ.</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    Συμμετοχή στο Διοικητικό Συμβούλιο
                  </span>
                </span>
              </label>

              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_president}
                  onChange={(e) =>
                    setForm((s) => ({
                      ...s,
                      is_president: e.target.checked,
                      is_board_member: e.target.checked
                        ? true
                        : s.is_board_member,
                      board_position: e.target.checked
                        ? "Πρόεδρος"
                        : s.board_position === "Πρόεδρος"
                          ? ""
                          : s.board_position,
                    }))
                  }
                  className="mt-0.5 h-4 w-4 rounded border-border"
                />
                <span>
                  <span className="font-medium">Πρόεδρος</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    Πλήρης πρόσβαση στο σύστημα
                  </span>
                </span>
              </label>
            </div>

            {(form.is_board_member || form.is_president) &&
              !form.is_president && (
                <Field label="Θέση">
                  <input
                    type="text"
                    list="board-positions"
                    value={form.board_position}
                    onChange={(e) =>
                      setForm((s) => ({
                        ...s,
                        board_position: e.target.value,
                      }))
                    }
                    placeholder="π.χ. Αντιπρόεδρος"
                    className={inputClass}
                  />
                  <datalist id="board-positions">
                    {BOARD_POSITIONS.map((p) => (
                      <option key={p} value={p} />
                    ))}
                  </datalist>
                </Field>
              )}
          </div>

          {formError && (
            <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
              {formError}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-border px-4 py-2 text-sm transition hover:bg-background disabled:opacity-50"
            >
              Ακύρωση
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {saving
                ? "Αποθήκευση…"
                : editing
                  ? "Αποθήκευση Αλλαγών"
                  : "Προσθήκη Μέλους"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>
      {children}
    </label>
  );
}
