"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRole } from "@/lib/hooks/useRole";
import { useCurrentClub } from "@/lib/hooks/useCurrentClub";
import { AccessDenied } from "@/lib/auth/AccessDenied";
import { getBrowserClient } from "@/lib/supabase/client";
import AnnouncementFormModal, {
  type AnnouncementFormInitial,
  type AnnouncementFormValues,
} from "@/components/AnnouncementFormModal";
import ConfirmDeleteAnnouncementModal from "@/components/ConfirmDeleteAnnouncementModal";
import type { Department } from "@/lib/supabase/types";

type Status = "loading" | "ready" | "error";

type AnnouncementRow = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  published: boolean;
  created_at: string;
  department_id: string | null;
  department_name: string | null;
  created_by: string | null;
  created_by_name: string | null;
};

type FormModalState = {
  mode: "create" | "edit";
  initial?: AnnouncementFormInitial;
};

function formatGreekDate(iso: string): string {
  return new Date(iso).toLocaleDateString("el-GR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function AnnouncementsPage() {
  const role = useRole();
  const { clubId, loading: clubLoading } = useCurrentClub();

  // List + status
  const [announcements, setAnnouncements] = useState<AnnouncementRow[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Departments (page-level, fetched once)
  const [departments, setDepartments] = useState<Department[]>([]);

  // Derive user's permission scope για announcements:create
  // (από role.scoped που γεμίζει το PR ζ.2 #97 engine).
  const canPostGlobal = useMemo(
    () =>
      role.scoped.some(
        (p) =>
          p.module === "announcements" &&
          p.action === "create" &&
          p.scope === "all"
      ),
    [role.scoped]
  );

  const allowedDeptIds = useMemo(
    () =>
      new Set(
        role.scoped
          .filter(
            (p) =>
              p.module === "announcements" &&
              p.action === "create" &&
              p.scope === "department" &&
              p.scope_department_id
          )
          .map((p) => p.scope_department_id as string)
      ),
    [role.scoped]
  );

  // Filter departments visible στο form modal:
  // - canPostGlobal: όλα τα departments (admin/president/scope='all')
  // - else: μόνο τα departments όπου ο user είναι ομαδάρχης
  const availableDepartments = useMemo(
    () =>
      canPostGlobal
        ? departments
        : departments.filter((d) => allowedDeptIds.has(d.id)),
    [canPostGlobal, departments, allowedDeptIds]
  );

  // Disable create action αν δεν μπορεί να γράψει πουθενά
  const canCreate = canPostGlobal || availableDepartments.length > 0;

  // Form modal state
  const [formModal, setFormModal] = useState<FormModalState | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<AnnouncementRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Derived permission gate — δεν χρειάζεται effect/setState
  const isDenied =
    !role.loading && !role.permissions.includes("announcements");

  // Refetch announcements — reused από initial fetch + post-mutation refresh
  const refetchAnnouncements = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/announcements");
      if (!res.ok) {
        const body = await res
          .json()
          .catch(() => ({ error: "Σφάλμα φόρτωσης" }));
        setErrorMsg(body.error || `HTTP ${res.status}`);
        setStatus("error");
        return;
      }
      const data = await res.json();
      setAnnouncements(data.announcements ?? []);
      setStatus("ready");
    } catch (e) {
      console.error("[/announcements] fetch failed", e);
      setErrorMsg("Σφάλμα δικτύου");
      setStatus("error");
    }
  }, []);

  // Initial data fetch (departments + announcements)
  useEffect(() => {
    if (isDenied) return;
    if (role.loading || clubLoading) return;
    if (!clubId) return;
    const activeClubId = clubId;

    let cancelled = false;

    async function fetchAll() {
      // Departments fetch (direct Supabase — pattern από settings/departments)
      const supabase = getBrowserClient();
      const { data: deptData, error: deptErr } = await supabase
        .from("departments")
        .select("*")
        .eq("club_id", activeClubId)
        .order("name", { ascending: true });

      if (cancelled) return;

      if (deptErr) {
        console.error("[/announcements] departments fetch failed", deptErr);
        // Όχι fatal — αφήνουμε empty array, το dropdown θα δείχνει μόνο
        // "Όλος ο σύλλογος"
        setDepartments([]);
      } else {
        setDepartments((deptData ?? []) as Department[]);
      }

      await refetchAnnouncements();
    }

    fetchAll();
    return () => {
      cancelled = true;
    };
  }, [isDenied, role.loading, clubLoading, clubId, refetchAnnouncements]);

  // Submit handler για create + edit
  async function handleSubmit(values: AnnouncementFormValues) {
    if (!formModal) return;
    setSaving(true);
    setSaveError(null);

    try {
      const isEdit = formModal.mode === "edit" && formModal.initial?.id;
      const url = isEdit
        ? `/api/admin/announcements/${formModal.initial!.id}`
        : "/api/admin/announcements";
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (!res.ok) {
        const body = await res
          .json()
          .catch(() => ({ error: "Σφάλμα αποθήκευσης" }));
        setSaveError(body.error || `HTTP ${res.status}`);
        setSaving(false);
        return;
      }

      // Success — close modal + refetch
      setFormModal(null);
      await refetchAnnouncements();
    } catch (e) {
      console.error("[/announcements] submit failed", e);
      setSaveError("Σφάλμα δικτύου");
    } finally {
      setSaving(false);
    }
  }

  // Delete handler
  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);

    try {
      const res = await fetch(
        `/api/admin/announcements/${deleteTarget.id}`,
        { method: "DELETE" },
      );

      if (!res.ok) {
        const body = await res
          .json()
          .catch(() => ({ error: "Σφάλμα διαγραφής" }));
        setDeleteError(body.error || `HTTP ${res.status}`);
        setDeleting(false);
        return;
      }

      // Success — close modal + refetch
      setDeleteTarget(null);
      await refetchAnnouncements();
    } catch (e) {
      console.error("[/announcements] delete failed", e);
      setDeleteError("Σφάλμα δικτύου");
    } finally {
      setDeleting(false);
    }
  }

  // Render branches
  if (isDenied) {
    return <AccessDenied />;
  }

  if (status === "loading" || role.loading || clubLoading) {
    return (
      <div className="mx-auto w-full max-w-3xl p-10 text-center text-muted">
        Φόρτωση…
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Ανακοινώσεις
          </h1>
          <p className="mt-1 text-sm text-muted">
            Διαχείριση ανακοινώσεων του συλλόγου.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setSaveError(null);
            setFormModal({ mode: "create" });
          }}
          disabled={!canCreate}
          title={
            canCreate
              ? undefined
              : "Δεν έχετε δικαίωμα δημιουργίας ανακοινώσεων"
          }
          className="shrink-0 rounded-lg bg-[#800000] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#660000] disabled:cursor-not-allowed disabled:opacity-50"
        >
          + Νέα ανακοίνωση
        </button>
      </header>

      {status === "error" && (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200">
          {errorMsg ?? "Σφάλμα φόρτωσης"}
        </div>
      )}

      {announcements.length === 0 && status === "ready" ? (
        <div className="rounded-xl border border-border bg-background p-8 text-center">
          <p className="text-sm text-muted">
            Δεν υπάρχουν ανακοινώσεις ακόμα. Πάτησε{" "}
            <span className="font-medium">+ Νέα ανακοίνωση</span> για να
            ξεκινήσεις.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => (
            <AnnouncementCard
              key={a.id}
              announcement={a}
              onEdit={() => {
                setSaveError(null);
                setFormModal({
                  mode: "edit",
                  initial: {
                    id: a.id,
                    title: a.title,
                    body: a.body,
                    department_id: a.department_id,
                    pinned: a.pinned,
                    published: a.published,
                  },
                });
              }}
              onDelete={() => {
                setDeleteError(null);
                setDeleteTarget(a);
              }}
            />
          ))}
        </div>
      )}

      {/* Modals — mount-once pattern */}
      {formModal && (
        <AnnouncementFormModal
          key={formModal.initial?.id ?? "create"}
          mode={formModal.mode}
          initial={formModal.initial}
          departments={availableDepartments}
          canPostGlobal={canPostGlobal}
          isSaving={saving}
          saveError={saveError}
          onClose={() => {
            if (!saving) setFormModal(null);
          }}
          onSubmit={handleSubmit}
        />
      )}

      {deleteTarget && (
        <ConfirmDeleteAnnouncementModal
          key={deleteTarget.id}
          announcementTitle={deleteTarget.title}
          isDeleting={deleting}
          deleteError={deleteError}
          onClose={() => {
            if (!deleting) setDeleteTarget(null);
          }}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}

function AnnouncementCard({
  announcement,
  onEdit,
  onDelete,
}: {
  announcement: AnnouncementRow;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const metadata = [
    formatGreekDate(announcement.created_at),
    announcement.created_by_name,
    announcement.department_name ? `Τμήμα: ${announcement.department_name}` : null,
  ].filter(Boolean);

  return (
    <article className="rounded-xl border border-border bg-background p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">
          {announcement.pinned && <span className="mr-1.5">📌</span>}
          {announcement.title}
        </h2>
        {!announcement.published && (
          <span className="shrink-0 rounded-full bg-muted/30 px-2.5 py-0.5 text-xs font-medium text-muted">
            Πρόχειρο
          </span>
        )}
      </div>

      <p className="mt-3 whitespace-pre-wrap text-sm text-foreground/90">
        {announcement.body}
      </p>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs text-muted">{metadata.join(" · ")}</p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onEdit}
            className="text-xs font-medium text-muted hover:text-foreground"
          >
            Επεξεργασία
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="text-xs font-medium text-muted hover:text-[#800000]"
          >
            Διαγραφή
          </button>
        </div>
      </div>
    </article>
  );
}
