"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { errorMessage, getBrowserClient } from "@/lib/supabase/client";
import { useRole } from "@/lib/hooks/useRole";
import { useCurrentClub } from "@/lib/hooks/useCurrentClub";
import { AccessDenied } from "@/lib/auth/AccessDenied";
import { DateInput } from "@/components/DateInput";
import { calculateAge, generateUuid } from "@/lib/utils/discounts";
import { formatMemberName } from "@/lib/utils/attendees";
import {
  formatRelativeDate,
  getVerificationState,
} from "@/lib/utils/verificationState";
import {
  BOARD_POSITIONS,
  DEPARTMENT_ROLE_LABELS,
  FAMILY_ROLE_LABELS,
  type Department,
  type DepartmentRole,
  type FamilyRole,
  type Member,
  type MemberInsert,
  type MemberStatus,
  type MemberUpdate,
} from "@/lib/supabase/types";
import { MemberHistoryTab } from "./MemberHistoryTab";

type MemberTab = "info" | "family" | "departments" | "role" | "history";

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
  family_role: FamilyRole | null;
  phone_verified: boolean;
  phone_verified_at: string | null;
  phone_verified_by: string | null;
  email_verified: boolean;
  email_verified_at: string | null;
  email_verified_by: string | null;
  father_name: string;
  mother_name: string;
  maiden_name: string;
  birthplace: string;
  residence: string;
  address: string;
  occupation: string;
  registry_number: string;
  application_number: string;
  application_date: string;
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
  family_role: null,
  phone_verified: false,
  phone_verified_at: null,
  phone_verified_by: null,
  email_verified: false,
  email_verified_at: null,
  email_verified_by: null,
  father_name: "",
  mother_name: "",
  maiden_name: "",
  birthplace: "",
  residence: "",
  address: "",
  occupation: "",
  registry_number: "",
  application_number: "",
  application_date: "",
};

function defaultFamilyRole(birthDate: string | null): FamilyRole {
  const age = calculateAge(birthDate);
  if (age != null && age < 18) return "child";
  return "parent";
}

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";


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
  const [unverifiedOnly, setUnverifiedOnly] = useState(false);
  const [missingField, setMissingField] = useState<string>("");
  const [sortBy, setSortBy] = useState<{
    column: "name" | "age" | "email" | "status" | "departments" | "occupation";
    direction: "asc" | "desc";
  }>({ column: "name", direction: "asc" });

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MemberWithDepartments | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [originalForm, setOriginalForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [statusModal, setStatusModal] = useState<{
    member: MemberWithDepartments;
    next: MemberStatus;
    reason: string;
    saving: boolean;
    error: string | null;
  } | null>(null);

  const canEditMembers = role.permissions.includes("members");

  function openStatusModal(member: MemberWithDepartments) {
    if (!canEditMembers) return;
    setStatusModal({
      member,
      next: member.status === "active" ? "inactive" : "active",
      reason: "",
      saving: false,
      error: null,
    });
  }

  async function handleToggleVerification(
    field: "phone" | "email",
    currentlyVerified: boolean
  ) {
    if (!editing || !clubId || !canEditMembers) return;
    const next = !currentlyVerified;
    const ts = next ? new Date().toISOString() : null;
    const verifier = next ? role.memberId : null;
    const update =
      field === "phone"
        ? {
            phone_verified: next,
            phone_verified_at: ts,
            phone_verified_by: verifier,
          }
        : {
            email_verified: next,
            email_verified_at: ts,
            email_verified_by: verifier,
          };
    try {
      const supabase = getBrowserClient();
      const { error: uErr } = await supabase
        .from("members")
        .update(update)
        .eq("id", editing.id)
        .eq("club_id", clubId);
      if (uErr) throw uErr;
      setForm((s) => ({ ...s, ...update }));
      await loadMembers();
    } catch (err) {
      setError(errorMessage(err, "Σφάλμα ενημέρωσης επιβεβαίωσης."));
    }
  }

  async function saveStatusChange() {
    if (!statusModal || !clubId) return;
    setStatusModal({ ...statusModal, saving: true, error: null });
    try {
      const supabase = getBrowserClient();
      const { error: uErr } = await supabase
        .from("members")
        .update({ status: statusModal.next })
        .eq("id", statusModal.member.id)
        .eq("club_id", clubId);
      if (uErr) throw uErr;
      setStatusModal(null);
      await loadMembers();
    } catch (err) {
      setStatusModal((s) =>
        s
          ? {
              ...s,
              saving: false,
              error: errorMessage(err, "Σφάλμα αλλαγής κατάστασης."),
            }
          : s
      );
    }
  }

  type Toast = {
    message: string;
    action?: { label: string; run: () => void };
  };
  const [toast, setToast] = useState<Toast | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [bulkModal, setBulkModal] = useState<BulkModalState | null>(null);
  useEffect(() => {
    if (!toast) return;
    const ms = toast.action ? 8000 : 5000;
    const id = window.setTimeout(() => setToast(null), ms);
    return () => window.clearTimeout(id);
  }, [toast]);

  function openCreateLinkedTo(memberId: string) {
    const next: FormState = {
      ...EMPTY_FORM,
      family_mode: "link",
      link_member_id: memberId,
      family_role: defaultFamilyRole(null),
    };
    setEditing(null);
    setForm(next);
    setOriginalForm(next);
    setFormError(null);
    setModalOpen(true);
    setToast(null);
  }

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
          a.name.localeCompare(b.name, "el", { sensitivity: "base" })
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
          a.name.localeCompare(b.name, "el", { sensitivity: "base" })
      ),
    [departments]
  );

  const activeDepartmentOptions = useMemo(
    () => departmentOptions.filter((d) => d.active),
    [departmentOptions]
  );

  const familyMembersByFamily = useMemo(() => {
    const m = new Map<string, MemberWithDepartments[]>();
    for (const x of members) {
      if (!x.family_id) continue;
      const list = m.get(x.family_id) ?? [];
      list.push(x);
      m.set(x.family_id, list);
    }
    return m;
  }, [members]);

  function familyTooltip(member: MemberWithDepartments): string {
    if (!member.family_id) return "";
    const all = familyMembersByFamily.get(member.family_id) ?? [];
    const rank = (r: FamilyRole | null): number => {
      if (r === "parent") return 0;
      if (r === "spouse") return 1;
      if (r === "child") return 2;
      return 3;
    };
    const sorted = [...all].sort((a, b) => {
      const dr = rank(a.family_role) - rank(b.family_role);
      if (dr !== 0) return dr;
      if (a.family_role === "child" && b.family_role === "child") {
        const aa = calculateAge(a.birth_date);
        const bb = calculateAge(b.birth_date);
        if (aa != null && bb != null) return aa - bb;
      }
      return `${a.last_name} ${a.first_name}`.localeCompare(
        `${b.last_name} ${b.first_name}`,
        "el"
      );
    });
    const lines = [`Οικογένεια — ${all.length} μέλη`];
    const max = 5;
    for (const x of sorted.slice(0, max)) {
      const role = x.family_role
        ? FAMILY_ROLE_LABELS[x.family_role]
        : "Μέλος";
      const age = calculateAge(x.birth_date);
      const name = `${x.last_name} ${x.first_name}`.trim();
      const tail = age != null && x.family_role === "child" ? ` (${age})` : "";
      lines.push(`• ${role}: ${name}${tail}`);
    }
    if (sorted.length > max) {
      lines.push(`+${sorted.length - max} περισσότερα`);
    }
    return lines.join("\n");
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result = members.filter((m) => {
      if (statusFilter !== "all" && m.status !== statusFilter) return false;
      if (boardOnly && !m.is_board_member) return false;
      if (familyOnly && !m.family_id) return false;
      if (unverifiedOnly) {
        const phoneIssue = !!m.phone && !m.phone_verified;
        const emailIssue = !!m.email && !m.email_verified;
        if (!phoneIssue && !emailIssue) return false;
      }
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
      if (missingField) {
        const isEmpty = (v: string | null | undefined) => !v || !v.trim();
        const checks: Record<string, boolean> = {
          phone:            isEmpty(m.phone),
          email:            isEmpty(m.email),
          birth_date:       !m.birth_date,
          address:          isEmpty(m.address),
          occupation:       isEmpty(m.occupation),
          father_name:      isEmpty(m.father_name),
          mother_name:      isEmpty(m.mother_name),
          maiden_name:      isEmpty(m.maiden_name),
        };
        if (!checks[missingField]) return false;
      }
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

    const dir = sortBy.direction === "asc" ? 1 : -1;
    const sorted = [...result].sort((a, b) => {
      switch (sortBy.column) {
        case "name": {
          return (
            formatMemberName(a).localeCompare(formatMemberName(b), "el", {
              sensitivity: "base",
            }) * dir
          );
        }
        case "age": {
          const aAge = calculateAge(a.birth_date);
          const bAge = calculateAge(b.birth_date);
          if (aAge == null && bAge == null) return 0;
          if (aAge == null) return 1;
          if (bAge == null) return -1;
          return (aAge - bAge) * dir;
        }
        case "email": {
          const aEmail = a.email ?? "";
          const bEmail = b.email ?? "";
          if (!aEmail && !bEmail) return 0;
          if (!aEmail) return 1;
          if (!bEmail) return -1;
          return (
            aEmail.localeCompare(bEmail, "el", { sensitivity: "base" }) * dir
          );
        }
        case "status": {
          const rank = (s: string) => (s === "active" ? 0 : 1);
          return (rank(a.status) - rank(b.status)) * dir;
        }
        case "departments": {
          const aFirst = a.departments[0]?.name ?? null;
          const bFirst = b.departments[0]?.name ?? null;
          if (aFirst === null && bFirst === null) return 0;
          if (aFirst === null) return 1;
          if (bFirst === null) return -1;
          return (
            aFirst.localeCompare(bFirst, "el", { sensitivity: "base" }) * dir
          );
        }
        case "occupation": {
          const aVal = a.occupation?.trim() || null;
          const bVal = b.occupation?.trim() || null;
          if (aVal === null && bVal === null) return 0;
          if (aVal === null) return 1;
          if (bVal === null) return -1;
          return aVal.localeCompare(bVal, "el", { sensitivity: "base" }) * dir;
        }
      }
    });
    return sorted;
  }, [
    members,
    search,
    statusFilter,
    boardOnly,
    familyOnly,
    unverifiedOnly,
    ageFilter,
    departmentFilter,
    missingField,
    sortBy,
  ]);

  function handleSort(column: SortColumn) {
    setSortBy((prev) =>
      prev.column === column
        ? { column, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { column, direction: "asc" }
    );
  }

  function clearFilters() {
    setSearch("");
    setDepartmentFilter("");
    setStatusFilter("all");
    setBoardOnly(false);
    setAgeFilter("all");
    setUnverifiedOnly(false);
    setFamilyOnly(false);
    setMissingField("");
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setOriginalForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(member: MemberWithDepartments) {
    const next: FormState = {
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
      family_role: member.family_role,
      phone_verified: member.phone_verified,
      phone_verified_at: member.phone_verified_at,
      phone_verified_by: member.phone_verified_by,
      email_verified: member.email_verified,
      email_verified_at: member.email_verified_at,
      email_verified_by: member.email_verified_by,
      father_name: member.father_name ?? "",
      mother_name: member.mother_name ?? "",
      maiden_name: member.maiden_name ?? "",
      birthplace: member.birthplace ?? "",
      residence: member.residence ?? "",
      address: member.address ?? "",
      occupation: member.occupation ?? "",
      registry_number: member.registry_number ?? "",
      application_number: member.application_number ?? "",
      application_date: member.application_date ?? "",
    };
    setEditing(member);
    setForm(next);
    setOriginalForm(next);
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

    if (form.family_mode !== "none" && !form.family_role) {
      setFormError("Επιλέξτε ρόλο στην οικογένεια.");
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
      is_board_member: isBoardMember,
      board_position: boardPosition,
      is_president: form.is_president,
      birth_date: form.birth_date || null,
      family_id: resolvedFamilyId,
      family_role:
        resolvedFamilyId && form.family_role ? form.family_role : null,
      father_name: form.father_name.trim() || null,
      mother_name: form.mother_name.trim() || null,
      maiden_name: form.maiden_name.trim() || null,
      birthplace: form.birthplace.trim() || null,
      residence: form.residence.trim() || null,
      address: form.address.trim() || null,
      occupation: form.occupation.trim() || null,
      registry_number: form.registry_number.trim() || null,
      application_number: form.application_number.trim() || null,
      application_date: form.application_date || null,
    };

    const wasCreate = !editing;
    const wasNewFamily = form.family_mode === "new";
    const displayedName = `${last_name} ${first_name}`.trim();

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
        const insert: MemberInsert = {
          ...payload,
          club_id: clubId,
          status: "active",
        };
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
      if (wasCreate) {
        if (wasNewFamily) {
          setToast({
            message: `✓ Ο/Η ${displayedName} προστέθηκε. Δημιουργήθηκε νέα οικογένεια.`,
            action: {
              label: "+ Προσθήκη μέλους στην οικογένεια",
              run: () => openCreateLinkedTo(memberId),
            },
          });
        } else {
          setToast({ message: "✓ Το μέλος προστέθηκε" });
        }
      }
    } catch (err) {
      setFormError(errorMessage(err, "Σφάλμα αποθήκευσης."));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(member: MemberWithDepartments) {
    const confirmed = window.confirm(
      `Διαγραφή του μέλους "${formatMemberName(member)}"; Η ενέργεια δεν αναιρείται.`
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
      closeModal();
      await loadMembers();
    } catch (err) {
      setError(errorMessage(err, "Σφάλμα διαγραφής μέλους."));
    }
  }

  async function handleSendVerification(member: MemberWithDepartments) {
    if (!member.email || member.email_verified) return;
    setSendingId(member.id);
    try {
      const res = await fetch(
        `/api/members/${member.id}/send-verification-email`,
        { method: "POST" }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast({ message: `✗ ${body.error ?? "Σφάλμα αποστολής"}` });
      } else {
        setToast({ message: `✓ Email στάλθηκε στο ${member.email}` });
      }
    } catch {
      setToast({ message: "✗ Σφάλμα δικτύου" });
    } finally {
      setSendingId(null);
    }
  }

  function openBulkModal() {
    const candidates = members.filter(
      (m) => m.email && !m.email_verified
    );
    if (candidates.length === 0) {
      setToast({ message: "Δεν υπάρχουν μέλη για αποστολή" });
      return;
    }
    setBulkModal({ phase: "confirm", count: candidates.length });
  }

  async function executeBulkSend() {
    setBulkModal({ phase: "sending" });
    try {
      const res = await fetch("/api/members/send-verification-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dry_run: false }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBulkModal(null);
        setToast({ message: `✗ ${body.error ?? "Σφάλμα"}` });
        return;
      }
      const rawErrors: Array<{ member_id: string; reason: string }> =
        body.errors ?? [];
      const errors = rawErrors.map((e) => {
        const member = members.find((m) => m.id === e.member_id);
        return {
          email: member?.email ?? e.member_id,
          error: e.reason,
        };
      });
      setBulkModal({
        phase: "result",
        sent: body.sent ?? 0,
        errors,
      });
    } catch {
      setBulkModal(null);
      setToast({ message: "✗ Σφάλμα δικτύου" });
    }
  }

  async function closeBulkModal() {
    const wasSuccess =
      bulkModal?.phase === "result" && bulkModal.sent > 0;
    setBulkModal(null);
    if (wasSuccess) {
      await loadMembers();
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
    familyOnly ||
    unverifiedOnly ||
    !!missingField;

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
    <div className="mx-auto w-full max-w-7xl">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight">
          Διαχείριση Μελών
        </h1>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={openBulkModal}
            disabled={bulkModal !== null}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm transition hover:bg-background disabled:opacity-50"
            title="Αποστολή verification email σε όλα τα μη-επιβεβαιωμένα"
          >
            📨 Bulk Verification
          </button>
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

      <div className="mb-4 rounded-xl border border-border bg-surface p-3 space-y-3">
        {/* Γραμμή 1: selects */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[14rem] flex-1">
            <label className="mb-1 block text-xs font-medium text-muted">Αναζήτηση</label>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Όνομα, τηλέφωνο, email…"
              className={inputClass}
            />
          </div>
          <div className="min-w-[10rem]">
            <label className="mb-1 block text-xs font-medium text-muted">Τμήμα</label>
            <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)} className={inputClass}>
              <option value="">— Όλα —</option>
              {departmentOptions.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[9rem]">
            <label className="mb-1 block text-xs font-medium text-muted">Κατάσταση</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | MemberStatus)} className={inputClass}>
              <option value="all">Όλες</option>
              <option value="active">Ενεργά</option>
              <option value="inactive">Ανενεργά</option>
            </select>
          </div>
          <div className="min-w-[10rem]">
            <label className="mb-1 block text-xs font-medium text-muted">Ηλικιακή κατηγορία</label>
            <select value={ageFilter} onChange={(e) => setAgeFilter(e.target.value as "all" | "child" | "adult")} className={inputClass}>
              <option value="all">Όλα</option>
              <option value="child">Παιδιά (&lt;18)</option>
              <option value="adult">Ενήλικες (18+)</option>
            </select>
          </div>
          <div className="min-w-[10rem]">
            <label className="mb-1 block text-xs font-medium text-muted">
              Ελλειπή Στοιχεία
            </label>
            <select
              value={missingField}
              onChange={(e) => setMissingField(e.target.value)}
              className={inputClass}
            >
              <option value="">— Όλα —</option>
              <option value="phone">Τηλέφωνο</option>
              <option value="email">Email</option>
              <option value="birth_date">Ημερομηνία γέννησης</option>
              <option value="address">Διεύθυνση</option>
              <option value="occupation">Επάγγελμα</option>
              <option value="father_name">Όνομα πατρός</option>
              <option value="mother_name">Όνομα μητρός</option>
              <option value="maiden_name">Γένος</option>
            </select>
          </div>
        </div>
        {/* Γραμμή 2: checkboxes + clear button */}
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={boardOnly} onChange={(e) => setBoardOnly(e.target.checked)} className="h-4 w-4 rounded border-border" />
            Μόνο Δ.Σ.
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={familyOnly} onChange={(e) => setFamilyOnly(e.target.checked)} className="h-4 w-4 rounded border-border" />
            Μόνο οικογένειες
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={unverifiedOnly} onChange={(e) => setUnverifiedOnly(e.target.checked)} className="h-4 w-4 rounded border-border" />
            Μόνο μη-επιβεβαιωμένα
          </label>
          <button
            type="button"
            onClick={clearFilters}
            disabled={!filtersActive}
            className="rounded-lg border border-border px-3 py-2 text-sm transition hover:bg-background disabled:opacity-50"
          >
            Καθαρισμός φίλτρων
          </button>
          <span className="ml-auto text-sm text-muted">
            {filtered.length === members.length
              ? `${members.length} μέλη`
              : `${filtered.length} / ${members.length} μέλη`}
          </span>
        </div>
      </div>

      {toast && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
          <span>{toast.message}</span>
          <div className="flex items-center gap-2">
            {toast.action && (
              <button
                type="button"
                onClick={toast.action.run}
                className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-medium transition hover:bg-emerald-500/20"
              >
                {toast.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => setToast(null)}
              className="shrink-0 rounded px-2 text-xs hover:opacity-70"
              aria-label="Κλείσιμο"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b-2 border-[#800000] bg-[#FAF5F5] text-xs uppercase tracking-wider text-[#800000]">
              <tr>
                <SortableHeader
                  label="Ονοματεπώνυμο"
                  column="name"
                  current={sortBy}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="Ηλικία"
                  column="age"
                  current={sortBy}
                  onSort={handleSort}
                />
                <th className="px-4 py-3">Τηλέφωνο</th>
                <SortableHeader
                  label="Email"
                  column="email"
                  current={sortBy}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="Τμήματα"
                  column="departments"
                  current={sortBy}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="Ιδιότητα"
                  column="occupation"
                  current={sortBy}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="Κατάσταση"
                  column="status"
                  current={sortBy}
                  onSort={handleSort}
                />
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
                  <tr
                    key={m.id}
                    onClick={() => openEdit(m)}
                    className="cursor-pointer transition hover:bg-background/50"
                  >
                    <td className="px-4 py-3 font-medium">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-2">
                          <span
                            title={
                              m.status === "active" ? "Ενεργό" : "Ανενεργό"
                            }
                            aria-label={
                              m.status === "active" ? "Ενεργό" : "Ανενεργό"
                            }
                            className={
                              "block h-2.5 w-2.5 shrink-0 rounded-full " +
                              (m.status === "active"
                                ? "bg-emerald-500"
                                : "bg-rose-500")
                            }
                          />
                          <span>{formatMemberName(m)}</span>
                        </span>
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
                            title={familyTooltip(m)}
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
                    <td className="px-4 py-3 text-muted">
                      {m.phone ? (
                        <span className="inline-flex items-center gap-1">
                          <span>{m.phone}</span>
                          <VerifyBadge
                            type="phone"
                            verified={m.phone_verified}
                            verifiedAt={m.phone_verified_at}
                            verifiedByName={lookupVerifierName(
                              members,
                              m.phone_verified_by
                            )}
                            canEdit={false}
                            size="sm"
                          />
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {m.email ? (
                        <span className="inline-flex items-center gap-1">
                          <span
                            className="block max-w-[200px] truncate"
                            title={m.email}
                          >
                            {m.email}
                          </span>
                          <VerifyBadge
                            type="email"
                            verified={m.email_verified}
                            verifiedAt={m.email_verified_at}
                            verifiedByName={lookupVerifierName(
                              members,
                              m.email_verified_by
                            )}
                            canEdit={false}
                            size="sm"
                          />
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
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
                      <span className="text-sm">
                        {m.occupation?.trim() || (
                          <span className="text-muted">—</span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {canEditMembers ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openStatusModal(m);
                          }}
                          className="rounded-full transition hover:opacity-80"
                          title="Αλλαγή κατάστασης"
                        >
                          <StatusBadge status={m.status} />
                        </button>
                      ) : (
                        <StatusBadge status={m.status} />
                      )}
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
          originalForm={originalForm}
          members={members}
          departments={activeDepartmentOptions}
          saving={saving}
          formError={formError}
          canEditMembers={canEditMembers}
          onClose={closeModal}
          onSubmit={handleSubmit}
          onAddFamilyMember={openCreateLinkedTo}
          onToggleVerification={handleToggleVerification}
          onDelete={() => editing && handleDelete(editing)}
          onSendVerification={() =>
            editing && handleSendVerification(editing)
          }
          sendingId={sendingId}
        />
      )}

      {statusModal && (
        <StatusChangeModal
          state={statusModal}
          setState={setStatusModal}
          onSave={saveStatusChange}
        />
      )}

      {bulkModal && (
        <BulkSendModal
          state={bulkModal}
          onConfirm={executeBulkSend}
          onClose={closeBulkModal}
        />
      )}
    </div>
  );
}

type BulkModalState =
  | { phase: "confirm"; count: number }
  | { phase: "sending" }
  | {
      phase: "result";
      sent: number;
      errors: Array<{ email: string; error: string }>;
    };

type SortColumn = "name" | "age" | "email" | "status" | "departments" | "occupation";
type SortState = { column: SortColumn; direction: "asc" | "desc" };

function SortableHeader({
  label,
  column,
  current,
  onSort,
  align = "left",
}: {
  label: string;
  column: SortColumn;
  current: SortState;
  onSort: (column: SortColumn) => void;
  align?: "left" | "right";
}) {
  const isActive = current.column === column;
  const arrow = isActive ? (current.direction === "asc" ? "↑" : "↓") : "";
  return (
    <th
      onClick={() => onSort(column)}
      className={
        "cursor-pointer select-none px-4 py-3 transition hover:bg-[#F0E6E6] " +
        (align === "right" ? "text-right" : "")
      }
      aria-sort={
        isActive
          ? current.direction === "asc"
            ? "ascending"
            : "descending"
          : "none"
      }
    >
      {label} <span>{arrow}</span>
    </th>
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
          : "bg-rose-500/10 text-rose-600 dark:text-rose-400")
      }
    >
      <span
        className={
          "h-1.5 w-1.5 rounded-full " +
          (isActive ? "bg-emerald-500" : "bg-rose-500")
        }
      />
      {isActive ? "Ενεργό" : "Ανενεργό"}
    </span>
  );
}

type StatusModalState = {
  member: MemberWithDepartments;
  next: MemberStatus;
  reason: string;
  saving: boolean;
  error: string | null;
};

function StatusChangeModal({
  state,
  setState,
  onSave,
}: {
  state: StatusModalState;
  setState: React.Dispatch<React.SetStateAction<StatusModalState | null>>;
  onSave: () => void;
}) {
  const fullName = `${state.member.last_name} ${state.member.first_name}`.trim();
  function close() {
    if (state.saving) return;
    setState(null);
  }
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={close}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">Αλλαγή Κατάστασης</h2>

        <div className="mt-4 space-y-1 text-sm">
          <p>
            <span className="text-muted">Μέλος: </span>
            <span className="font-medium uppercase">{fullName}</span>
          </p>
          <p className="flex items-center gap-2">
            <span className="text-muted">Τρέχουσα:</span>
            <StatusBadge status={state.member.status} />
          </p>
        </div>

        <fieldset className="mt-4">
          <legend className="mb-2 block text-xs font-medium text-muted">
            Νέα Κατάσταση
          </legend>
          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="next_status"
                checked={state.next === "active"}
                onChange={() =>
                  setState((s) => (s ? { ...s, next: "active" } : s))
                }
                className="h-4 w-4"
              />
              Ενεργό
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="next_status"
                checked={state.next === "inactive"}
                onChange={() =>
                  setState((s) => (s ? { ...s, next: "inactive" } : s))
                }
                className="h-4 w-4"
              />
              Ανενεργό
            </label>
          </div>
        </fieldset>

        <label className="mt-4 block">
          <span className="mb-1 block text-xs font-medium text-muted">
            Λόγος (προαιρετικό)
          </span>
          <textarea
            value={state.reason}
            onChange={(e) =>
              setState((s) => (s ? { ...s, reason: e.target.value } : s))
            }
            rows={3}
            placeholder="π.χ. Μεταγραφή σε άλλον σύλλογο"
            className={inputClass}
          />
        </label>

        {state.error && (
          <div className="mt-3 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
            {state.error}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={close}
            disabled={state.saving}
            className="rounded-lg border border-border px-4 py-2 text-sm transition hover:bg-background disabled:opacity-50"
          >
            Ακύρωση
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={
              state.saving || state.next === state.member.status
            }
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {state.saving ? "Αποθήκευση…" : "Αποθήκευση"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MemberModal({
  editing,
  form,
  setForm,
  originalForm,
  members,
  departments,
  saving,
  formError,
  canEditMembers,
  onClose,
  onSubmit,
  onAddFamilyMember,
  onToggleVerification,
  onDelete,
  onSendVerification,
  sendingId,
}: {
  editing: Member | null;
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  originalForm: FormState;
  members: MemberWithDepartments[];
  departments: Department[];
  saving: boolean;
  formError: string | null;
  canEditMembers: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onAddFamilyMember: (memberId: string) => void;
  onToggleVerification: (
    field: "phone" | "email",
    currentlyVerified: boolean
  ) => void | Promise<void>;
  onDelete: () => void;
  onSendVerification: () => void;
  sendingId: string | null;
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

  const dirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(originalForm),
    [form, originalForm]
  );

  const linkContext = useMemo<{
    targetMemberId: string;
    familyId: string | null;
    othersCount: number;
  } | null>(() => {
    if (editing && editing.family_id) {
      const others = members.filter(
        (m) => m.family_id === editing.family_id && m.id !== editing.id
      ).length;
      return {
        targetMemberId: editing.id,
        familyId: editing.family_id,
        othersCount: others,
      };
    }
    if (!editing && form.family_mode === "link" && form.link_member_id) {
      const t = members.find((m) => m.id === form.link_member_id);
      if (!t) return null;
      const others = t.family_id
        ? members.filter(
            (m) => m.family_id === t.family_id && m.id !== t.id
          ).length + 1
        : 1;
      return {
        targetMemberId: t.id,
        familyId: t.family_id,
        othersCount: others,
      };
    }
    return null;
  }, [editing, members, form.family_mode, form.link_member_id]);

  function handleAddFamilyMember() {
    if (!linkContext) return;
    if (dirty) {
      const ok = window.confirm(
        "Θα χαθούν οι τρέχουσες αλλαγές. Συνέχεια;"
      );
      if (!ok) return;
    }
    onAddFamilyMember(linkContext.targetMemberId);
  }

  useEffect(() => {
    if (form.family_mode === "none") {
      if (form.family_role !== null) {
        setForm((s) => ({ ...s, family_role: null }));
      }
    } else if (!form.family_role) {
      setForm((s) => ({
        ...s,
        family_role: defaultFamilyRole(form.birth_date || null),
      }));
    }
  }, [form.family_mode, form.birth_date, form.family_role, setForm]);

  const familyMembers = useMemo<MemberWithDepartments[]>(() => {
    let famId: string | null = null;
    if (editing && editing.family_id) {
      famId = editing.family_id;
    } else if (
      !editing &&
      form.family_mode === "link" &&
      form.link_member_id
    ) {
      const t = members.find((m) => m.id === form.link_member_id);
      famId = t?.family_id ?? null;
    }
    if (!famId) return [];
    const list = members.filter(
      (m) => m.family_id === famId && m.id !== editing?.id
    );
    const rank = (r: FamilyRole | null): number => {
      if (r === "parent") return 0;
      if (r === "spouse") return 1;
      if (r === "child") return 2;
      return 3;
    };
    return [...list].sort((a, b) => {
      const dr = rank(a.family_role) - rank(b.family_role);
      if (dr !== 0) return dr;
      if (a.family_role === "child" && b.family_role === "child") {
        const aa = calculateAge(a.birth_date);
        const bb = calculateAge(b.birth_date);
        if (aa != null && bb != null) return aa - bb;
      }
      return `${a.last_name} ${a.first_name}`.localeCompare(
        `${b.last_name} ${b.first_name}`,
        "el"
      );
    });
  }, [editing, members, form.family_mode, form.link_member_id]);

  const age = calculateAge(form.birth_date || null);

  const [tab, setTab] = useState<MemberTab>("info");

  const infoMissing =
    !form.first_name.trim() || !form.last_name.trim();
  const familyMissing =
    form.family_mode !== "none" && !form.family_role;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-xl border border-border bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {editing ? (
                <>
                  <h2 className="inline-flex items-center gap-2 text-xl font-semibold uppercase">
                    <span
                      title={editing.status === "active" ? "Ενεργό" : "Ανενεργό"}
                      aria-label={
                        editing.status === "active" ? "Ενεργό" : "Ανενεργό"
                      }
                      className={
                        "block h-2.5 w-2.5 shrink-0 rounded-full " +
                        (editing.status === "active"
                          ? "bg-emerald-500"
                          : "bg-rose-500")
                      }
                    />
                    <span>
                      {`${form.last_name} ${form.first_name}`.trim() ||
                        "Επεξεργασία μέλους"}
                    </span>
                  </h2>
                  <p className="mt-0.5 text-sm text-muted">
                    {`${form.last_name} ${form.first_name}`.trim()
                      ? "Επεξεργασία μέλους"
                      : ""}
                  </p>
                </>
              ) : (
                <>
                  <h2 className="text-xl font-semibold">Νέο Μέλος</h2>
                  <p className="mt-0.5 text-sm text-muted">
                    Συμπληρώστε τα στοιχεία
                  </p>
                </>
              )}
            </div>
            {editing && canEditMembers && (
              <button
                type="button"
                onClick={onDelete}
                className="whitespace-nowrap rounded-md border border-danger/30 px-3 py-1 text-xs text-danger transition hover:bg-danger/10"
                title="Διαγραφή μέλους"
              >
                🗑 Διαγραφή
              </button>
            )}
          </div>
          {editing && editing.email && (
            <VerificationStatusBar
              member={editing}
              isSending={sendingId === editing.id}
              onSend={onSendVerification}
            />
          )}
          <div className="mt-3 inline-flex max-w-full overflow-x-auto rounded-lg border border-border bg-background p-0.5 text-xs">
            <MemberTabBtn
              current={tab}
              value="info"
              onSelect={setTab}
              hasError={infoMissing}
            >
              Στοιχεία
            </MemberTabBtn>
            <MemberTabBtn
              current={tab}
              value="family"
              onSelect={setTab}
              hasError={familyMissing}
            >
              Οικογένεια
            </MemberTabBtn>
            <MemberTabBtn
              current={tab}
              value="departments"
              onSelect={setTab}
            >
              Τμήματα
            </MemberTabBtn>
            <MemberTabBtn current={tab} value="role" onSelect={setTab}>
              Ρόλος
            </MemberTabBtn>
            {editing && (
              <MemberTabBtn current={tab} value="history" onSelect={setTab}>
                Ιστορικό
              </MemberTabBtn>
            )}
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
            {tab === "info" && (
              <>
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
            <label className="block">
              <span className="mb-1 flex items-center justify-between text-xs font-medium text-muted">
                <span>Τηλέφωνο</span>
                {editing && (
                  <VerifyBadge
                    type="phone"
                    verified={form.phone_verified}
                    verifiedAt={form.phone_verified_at}
                    verifiedByName={lookupVerifierName(
                      members,
                      form.phone_verified_by
                    )}
                    canEdit={canEditMembers && !!form.phone.trim()}
                    onToggle={() =>
                      onToggleVerification("phone", form.phone_verified)
                    }
                  />
                )}
              </span>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) =>
                  setForm((s) => ({ ...s, phone: e.target.value }))
                }
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="mb-1 flex items-center justify-between text-xs font-medium text-muted">
                <span>Email</span>
                {editing && (
                  <VerifyBadge
                    type="email"
                    verified={form.email_verified}
                    verifiedAt={form.email_verified_at}
                    verifiedByName={lookupVerifierName(
                      members,
                      form.email_verified_by
                    )}
                    canEdit={canEditMembers && !!form.email.trim()}
                    onToggle={() =>
                      onToggleVerification("email", form.email_verified)
                    }
                  />
                )}
              </span>
              <input
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm((s) => ({ ...s, email: e.target.value }))
                }
                className={inputClass}
              />
            </label>
          </div>

                <Field label="Ημερομηνία Γέννησης">
                  <div className="flex items-center gap-2">
                    <DateInput
                      value={form.birth_date}
                      onChange={(iso) =>
                        setForm((s) => ({ ...s, birth_date: iso }))
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

                <h3 className="text-sm font-semibold text-foreground mt-4 mb-2 pb-1 border-b border-border">
                  Γονείς
                </h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Όνομα Πατρός">
                    <input
                      type="text"
                      value={form.father_name}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, father_name: e.target.value }))
                      }
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Όνομα Μητρός">
                    <input
                      type="text"
                      value={form.mother_name}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, mother_name: e.target.value }))
                      }
                      className={inputClass}
                    />
                  </Field>
                </div>
                <Field label="Γένος (πατρικό)">
                  <input
                    type="text"
                    value={form.maiden_name}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, maiden_name: e.target.value }))
                    }
                    className={inputClass}
                  />
                </Field>

                <h3 className="text-sm font-semibold text-foreground mt-4 mb-2 pb-1 border-b border-border">
                  Καταγωγή & Διεύθυνση
                </h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Τόπος Γέννησης">
                    <input
                      type="text"
                      value={form.birthplace}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, birthplace: e.target.value }))
                      }
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Τόπος Κατοικίας">
                    <input
                      type="text"
                      value={form.residence}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, residence: e.target.value }))
                      }
                      className={inputClass}
                    />
                  </Field>
                </div>
                <Field label="Διεύθυνση">
                  <input
                    type="text"
                    value={form.address}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, address: e.target.value }))
                    }
                    className={inputClass}
                  />
                </Field>

                <h3 className="text-sm font-semibold text-foreground mt-4 mb-2 pb-1 border-b border-border">
                  Επάγγελμα
                </h3>
                <Field label="Επάγγελμα">
                  <input
                    type="text"
                    value={form.occupation}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, occupation: e.target.value }))
                    }
                    className={inputClass}
                  />
                </Field>

                <h3 className="text-sm font-semibold text-foreground mt-4 mb-2 pb-1 border-b border-border">
                  Στοιχεία Μητρώου
                </h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Αριθμός Μητρώου">
                    <input
                      type="text"
                      value={form.registry_number}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, registry_number: e.target.value }))
                      }
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Αριθμός Αίτησης">
                    <input
                      type="text"
                      value={form.application_number}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, application_number: e.target.value }))
                      }
                      className={inputClass}
                    />
                  </Field>
                </div>
                <Field label="Ημερομηνία Αίτησης">
                  <DateInput
                    value={form.application_date}
                    onChange={(iso) =>
                      setForm((s) => ({ ...s, application_date: iso }))
                    }
                    className={inputClass}
                  />
                </Field>
              </>
            )}

            {tab === "family" && (
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

              {form.family_mode !== "none" && (
                <div className="mt-3 border-t border-border pt-3">
                  <label className="block text-xs font-medium text-muted">
                    Ρόλος στην οικογένεια
                    <span className="text-danger"> *</span>
                  </label>
                  <select
                    required
                    value={form.family_role ?? ""}
                    onChange={(e) =>
                      setForm((s) => ({
                        ...s,
                        family_role: (e.target.value || null) as
                          | FamilyRole
                          | null,
                      }))
                    }
                    className={inputClass + " mt-1"}
                  >
                    <option value="parent">
                      {FAMILY_ROLE_LABELS.parent}
                    </option>
                    <option value="child">
                      {FAMILY_ROLE_LABELS.child}
                    </option>
                    <option value="spouse">
                      {FAMILY_ROLE_LABELS.spouse}
                    </option>
                    <option value="other">
                      {FAMILY_ROLE_LABELS.other}
                    </option>
                  </select>
                </div>
              )}

              {linkContext && (
                <div className="mt-3 border-t border-border pt-3 text-xs">
                  <p className="mb-1.5 text-muted">
                    👪 Μέλη οικογένειας ({familyMembers.length}):
                  </p>
                  {familyMembers.length === 0 ? (
                    <p className="text-muted">— Κανένα άλλο μέλος —</p>
                  ) : (
                    <ul className="space-y-0.5">
                      {familyMembers.map((m) => {
                        const a = calculateAge(m.birth_date);
                        const roleLabel = m.family_role
                          ? FAMILY_ROLE_LABELS[m.family_role]
                          : null;
                        return (
                          <li key={m.id}>
                            <span className="font-medium uppercase">
                              {m.last_name} {m.first_name}
                            </span>
                            {(roleLabel || a != null) && (
                              <span className="text-muted">
                                {" "}
                                —{" "}
                                {[
                                  roleLabel,
                                  a != null ? `${a} ετών` : null,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={handleAddFamilyMember}
                      className="font-medium text-[var(--brand-primary)] hover:underline"
                    >
                      + Προσθήκη μέλους στην οικογένεια
                    </button>
                  </div>
                </div>
              )}
              </div>
            )}

            {tab === "departments" && (
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
            )}

            {tab === "role" && (
              <>
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
              </>
            )}

            {tab === "history" && editing && (
              <MemberHistoryTab memberId={editing.id} />
            )}
          </div>

          <div className="border-t border-border p-6">
            {formError && (
              <div className="mb-3 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
                {formError}
              </div>
            )}
            <div className="flex justify-end gap-2">
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
                  ? "Αποθήκευση"
                  : "Προσθήκη Μέλους"}
            </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function VerificationStatusBar({
  member,
  isSending,
  onSend,
}: {
  member: Member;
  isSending: boolean;
  onSend: () => void;
}) {
  const state = getVerificationState(member);
  if (state === "no_email") return null;

  let icon: string;
  let text: string;
  let tone: string;
  let showButton = false;
  let buttonLabel = "";
  let buttonTone = "";

  switch (state) {
    case "never_sent":
      icon = "✉️";
      text = "Email: εκκρεμεί επιβεβαίωση";
      tone = "text-muted";
      showButton = true;
      buttonLabel = "📧 Αποστολή";
      buttonTone =
        "border-[#800000] text-[#800000] hover:bg-[#800000]/10";
      break;
    case "pending":
      icon = "⏳";
      text = `Email: στάλθηκε ${formatRelativeDate(member.email_verification_sent_at)}`;
      tone = "text-muted";
      showButton = true;
      buttonLabel = "🔄 Επανάληψη";
      buttonTone =
        "border-border text-foreground hover:bg-background";
      break;
    case "expired":
      icon = "⌛";
      text = `Email: έληξε ${formatRelativeDate(member.email_verification_expires_at)}`;
      tone = "text-amber-700 dark:text-amber-400";
      showButton = true;
      buttonLabel = "🔄 Επανάληψη";
      buttonTone =
        "border-amber-500 text-amber-700 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-950/30";
      break;
    case "verified":
      icon = "✅";
      text = `Email: επιβεβαιώθηκε ${formatRelativeDate(member.email_verified_at)}`;
      tone = "text-emerald-700 dark:text-emerald-400";
      break;
  }

  return (
    <div className="mt-2 flex items-center gap-2 text-xs">
      <span className={tone}>
        {icon} {text}
      </span>
      {showButton && (
        <button
          type="button"
          onClick={onSend}
          disabled={isSending}
          className={`rounded-md border px-2 py-1 transition disabled:opacity-50 ${buttonTone}`}
        >
          {isSending ? "..." : buttonLabel}
        </button>
      )}
    </div>
  );
}

function MemberTabBtn({
  current,
  value,
  onSelect,
  hasError,
  children,
}: {
  current: MemberTab;
  value: MemberTab;
  onSelect: (v: MemberTab) => void;
  hasError?: boolean;
  children: React.ReactNode;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={
        "inline-flex shrink-0 items-center gap-1 rounded-md px-3 py-1 transition " +
        (active
          ? "bg-accent text-white"
          : "text-muted hover:text-foreground")
      }
    >
      <span>{children}</span>
      {hasError && (
        <span
          aria-hidden
          className={
            "inline-block h-1.5 w-1.5 rounded-full " +
            (active ? "bg-white" : "bg-danger")
          }
          title="Λείπουν υποχρεωτικά πεδία"
        />
      )}
    </button>
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

function lookupVerifierName(
  members: { id: string; first_name: string; last_name: string }[],
  verifierId: string | null
): string | null {
  if (!verifierId) return null;
  const v = members.find((m) => m.id === verifierId);
  if (!v) return null;
  return `${v.last_name} ${v.first_name}`.trim();
}

function BulkSendModal({
  state,
  onConfirm,
  onClose,
}: {
  state: BulkModalState;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const isBlocking = state.phase === "sending";
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={() => {
        if (!isBlocking) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {state.phase === "confirm" && (
          <>
            <h2 className="text-lg font-semibold">Αποστολή verification</h2>
            <p className="mt-3 text-sm">
              Θα σταλούν{" "}
              <span className="font-semibold">{state.count}</span> emails σε
              όλα τα μη-επιβεβαιωμένα μέλη. Συνέχεια;
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-border px-4 py-2 text-sm transition hover:bg-background"
              >
                Ακύρωση
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className="rounded-lg bg-[#800000] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#660000]"
              >
                Αποστολή
              </button>
            </div>
          </>
        )}

        {state.phase === "sending" && (
          <div className="flex flex-col items-center gap-3 py-4">
            <span
              className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-border border-t-[#800000]"
              aria-hidden="true"
            />
            <p className="text-sm text-muted">
              Αποστολή... παρακαλώ περιμένετε
            </p>
          </div>
        )}

        {state.phase === "result" && (
          <>
            <h2 className="text-lg font-semibold">
              {state.errors.length === 0
                ? "✅ Επιτυχής αποστολή"
                : "⚠️ Ολοκληρώθηκε με σφάλματα"}
            </h2>
            <div className="mt-4 space-y-2 text-sm">
              <p>
                Στάλθηκαν:{" "}
                <span className="font-semibold">{state.sent}</span> emails
              </p>
              {state.errors.length > 0 && (
                <div>
                  <p className="text-amber-700 dark:text-amber-400">
                    Σφάλματα: {state.errors.length}
                  </p>
                  <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border bg-background p-2 text-xs">
                    {state.errors.map((e, idx) => (
                      <li key={idx} className="break-words">
                        <span className="font-medium">{e.email}</span>
                        <span className="text-muted"> — {e.error}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-[#800000] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#660000]"
              >
                Κλείσιμο
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function VerifyBadge({
  type,
  verified,
  verifiedAt,
  verifiedByName,
  canEdit,
  onToggle,
  size = "md",
}: {
  type: "phone" | "email";
  verified: boolean;
  verifiedAt: string | null;
  verifiedByName: string | null;
  canEdit: boolean;
  onToggle?: () => void | Promise<void>;
  size?: "sm" | "md";
}) {
  const label = type === "phone" ? "τηλεφώνου" : "email";
  let title: string;
  if (verified) {
    const date = verifiedAt
      ? new Date(verifiedAt).toLocaleDateString("el-GR")
      : null;
    const parts = [
      "Επιβεβαιωμένο",
      verifiedByName ? `από ${verifiedByName}` : null,
      date ? `στις ${date}` : null,
    ].filter(Boolean);
    title = parts.join(" ");
  } else {
    title = "Δεν έχει επιβεβαιωθεί";
  }
  const iconClass = size === "sm" ? "text-xs" : "text-sm";
  const icon = verified ? (
    <span
      className={
        "inline-flex items-center text-emerald-600 dark:text-emerald-400 " +
        iconClass
      }
      aria-hidden
    >
      ✓
    </span>
  ) : (
    <span
      className={
        "inline-flex items-center text-amber-600 dark:text-amber-400 " +
        iconClass
      }
      aria-hidden
    >
      ⚠
    </span>
  );

  if (!canEdit || !onToggle) {
    return (
      <span title={title} aria-label={title} className="inline-flex">
        {icon}
      </span>
    );
  }

  function handleClick() {
    const verb = verified
      ? `Αναίρεση επιβεβαίωσης ${label};`
      : `Επιβεβαίωση ${label};`;
    if (!window.confirm(verb)) return;
    void onToggle?.();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title={title}
      aria-label={title}
      className="inline-flex items-center transition hover:scale-110"
    >
      {icon}
    </button>
  );
}
