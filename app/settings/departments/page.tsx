"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { errorMessage, getBrowserClient } from "@/lib/supabase/client";
import { useRole } from "@/lib/hooks/useRole";
import { useCurrentClub } from "@/lib/hooks/useCurrentClub";
import { AccessDenied } from "@/lib/auth/AccessDenied";
import type {
  Department,
  DepartmentInsert,
  DepartmentUpdate,
} from "@/lib/supabase/types";

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

type Form = {
  name: string;
  description: string;
  display_order: string;
  active: boolean;
};

function emptyForm(nextOrder: number): Form {
  return {
    name: "",
    description: "",
    display_order: String(nextOrder),
    active: true,
  };
}

export default function DepartmentsPage() {
  const role = useRole();
  const { clubId, loading: clubLoading } = useCurrentClub();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [form, setForm] = useState<Form>(emptyForm(0));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!clubId) return;
    try {
      const supabase = getBrowserClient();
      const [dRes, mRes] = await Promise.all([
        supabase
          .from("departments")
          .select("*")
          .eq("club_id", clubId)
          .order("display_order", { ascending: true })
          .order("name", { ascending: true }),
        supabase
          .from("member_departments")
          .select("department_id")
          .eq("club_id", clubId),
      ]);
      if (dRes.error) throw dRes.error;
      if (mRes.error) throw mRes.error;
      setDepartments((dRes.data ?? []) as Department[]);
      const byDept = new Map<string, number>();
      for (const r of mRes.data ?? []) {
        byDept.set(r.department_id, (byDept.get(r.department_id) ?? 0) + 1);
      }
      setCounts(byDept);
      setError(null);
    } catch (err) {
      setError(errorMessage(err, "Σφάλμα φόρτωσης τμημάτων."));
    } finally {
      setLoading(false);
    }
  }, [clubId]);

  useEffect(() => {
    if (clubLoading) return;
    load();
  }, [load, clubLoading]);

  const nextOrder = useMemo(
    () =>
      departments.length === 0
        ? 1
        : Math.max(...departments.map((d) => d.display_order)) + 1,
    [departments]
  );

  function openCreate() {
    setEditing(null);
    setForm(emptyForm(nextOrder));
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(d: Department) {
    setEditing(d);
    setForm({
      name: d.name,
      description: d.description ?? "",
      display_order: String(d.display_order),
      active: d.active,
    });
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setModalOpen(false);
    setEditing(null);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    if (!clubId) {
      setFormError("Δεν έχει εντοπιστεί σύλλογος.");
      return;
    }
    const name = form.name.trim();
    if (!name) {
      setFormError("Το όνομα είναι υποχρεωτικό.");
      return;
    }
    const order = parseInt(form.display_order, 10) || 0;
    setSaving(true);
    try {
      const supabase = getBrowserClient();
      if (editing) {
        const update: DepartmentUpdate = {
          name,
          description: form.description.trim() || null,
          display_order: order,
          active: form.active,
        };
        const { error: uErr } = await supabase
          .from("departments")
          .update(update)
          .eq("id", editing.id)
          .eq("club_id", clubId);
        if (uErr) throw uErr;
      } else {
        const insert: DepartmentInsert = {
          club_id: clubId,
          name,
          description: form.description.trim() || null,
          display_order: order,
          active: form.active,
        };
        const { error: iErr } = await supabase
          .from("departments")
          .insert(insert);
        if (iErr) throw iErr;
      }
      setModalOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      setFormError(errorMessage(err, "Σφάλμα αποθήκευσης τμήματος."));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(d: Department) {
    if (!clubId) return;
    try {
      const supabase = getBrowserClient();
      const { error: uErr } = await supabase
        .from("departments")
        .update({ active: !d.active })
        .eq("id", d.id)
        .eq("club_id", clubId);
      if (uErr) throw uErr;
      await load();
    } catch (err) {
      setError(errorMessage(err, "Σφάλμα ενημέρωσης κατάστασης."));
    }
  }

  async function move(d: Department, direction: -1 | 1) {
    if (!clubId) return;
    const sorted = [...departments].sort(
      (a, b) => a.display_order - b.display_order
    );
    const idx = sorted.findIndex((x) => x.id === d.id);
    const swap = sorted[idx + direction];
    if (!swap) return;
    try {
      const supabase = getBrowserClient();
      const { error: e1 } = await supabase
        .from("departments")
        .update({ display_order: swap.display_order })
        .eq("id", d.id)
        .eq("club_id", clubId);
      if (e1) throw e1;
      const { error: e2 } = await supabase
        .from("departments")
        .update({ display_order: d.display_order })
        .eq("id", swap.id)
        .eq("club_id", clubId);
      if (e2) throw e2;
      await load();
    } catch (err) {
      setError(errorMessage(err, "Σφάλμα αλλαγής σειράς."));
    }
  }

  async function handleDelete(d: Department) {
    const memberCount = counts.get(d.id) ?? 0;
    const msg =
      memberCount > 0
        ? `Διαγραφή τμήματος «${d.name}»; Θα αποσυνδεθεί από ${memberCount} ${
            memberCount === 1 ? "μέλος" : "μέλη"
          }.`
        : `Διαγραφή τμήματος «${d.name}»;`;
    if (!window.confirm(msg)) return;
    if (!clubId) return;
    try {
      const supabase = getBrowserClient();
      const { error: dErr } = await supabase
        .from("departments")
        .delete()
        .eq("id", d.id)
        .eq("club_id", clubId);
      if (dErr) throw dErr;
      await load();
    } catch (err) {
      setError(errorMessage(err, "Σφάλμα διαγραφής τμήματος."));
    }
  }

  if (role.loading) {
    return (
      <div className="mx-auto w-full max-w-5xl p-10 text-center text-muted">
        Φόρτωση…
      </div>
    );
  }
  if (role.userId && !role.permissions.includes("members")) {
    return <AccessDenied />;
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <Link
        href="/settings"
        className="mb-2 inline-flex items-center gap-1 text-sm text-muted transition hover:text-foreground"
      >
        ← Ρυθμίσεις
      </Link>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Ρυθμίσεις › Τμήματα</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Τμήματα
          </h1>
          <p className="mt-1 text-sm text-muted">
            Διαχειριστείτε τα τμήματα του συλλόγου σας.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90"
        >
          + Νέο Τμήμα
        </button>
      </header>

      {error && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-border bg-surface">
        {loading ? (
          <p className="p-6 text-center text-sm text-muted">Φόρτωση…</p>
        ) : departments.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted">
            Δεν υπάρχουν τμήματα ακόμη. Πατήστε «Νέο Τμήμα».
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-background/40 text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-3 py-2 w-12">#</th>
                <th className="px-3 py-2">Όνομα</th>
                <th className="px-3 py-2">Περιγραφή</th>
                <th className="px-3 py-2 text-right">Μέλη</th>
                <th className="px-3 py-2 text-center">Active</th>
                <th className="px-3 py-2 text-right">Ενέργειες</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {departments.map((d, idx) => (
                <tr key={d.id}>
                  <td className="px-3 py-2 text-muted">{d.display_order}</td>
                  <td className="px-3 py-2 font-medium">{d.name}</td>
                  <td className="px-3 py-2 max-w-md truncate text-xs text-muted">
                    {d.description ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {counts.get(d.id) ?? 0}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => toggleActive(d)}
                      className="rounded-md border border-border px-2 py-0.5 text-xs transition hover:bg-foreground/5"
                      title={d.active ? "Απενεργοποίηση" : "Ενεργοποίηση"}
                      aria-label={d.active ? "Απενεργοποίηση" : "Ενεργοποίηση"}
                    >
                      {d.active ? "✓" : "—"}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => move(d, -1)}
                        disabled={idx === 0}
                        className="rounded-md border border-border px-2 py-1 text-[11px] transition hover:bg-foreground/5 disabled:opacity-40"
                        title="Μετακίνηση πάνω"
                        aria-label="Μετακίνηση πάνω"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => move(d, 1)}
                        disabled={idx === departments.length - 1}
                        className="rounded-md border border-border px-2 py-1 text-[11px] transition hover:bg-foreground/5 disabled:opacity-40"
                        title="Μετακίνηση κάτω"
                        aria-label="Μετακίνηση κάτω"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(d)}
                        className="rounded-md border border-border px-2 py-1 text-[11px] transition hover:bg-foreground/5"
                        title="Επεξεργασία"
                        aria-label="Επεξεργασία"
                      >
                        ✏
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(d)}
                        className="rounded-md border border-danger/30 px-2 py-1 text-[11px] text-danger transition hover:bg-danger/10"
                        title="Διαγραφή"
                        aria-label="Διαγραφή"
                      >
                        🗑
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {modalOpen && (
        <DepartmentModal
          editing={editing}
          form={form}
          setForm={setForm}
          saving={saving}
          formError={formError}
          onClose={closeModal}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}

function DepartmentModal({
  editing,
  form,
  setForm,
  saving,
  formError,
  onClose,
  onSubmit,
}: {
  editing: Department | null;
  form: Form;
  setForm: React.Dispatch<React.SetStateAction<Form>>;
  saving: boolean;
  formError: string | null;
  onClose: () => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold">
          {editing ? "Επεξεργασία Τμήματος" : "Νέο Τμήμα"}
        </h2>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Όνομα" required>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) =>
                setForm((s) => ({ ...s, name: e.target.value }))
              }
              placeholder="π.χ. Χορευτικό"
              className={inputClass}
            />
          </Field>
          <Field label="Περιγραφή">
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm((s) => ({ ...s, description: e.target.value }))
              }
              rows={3}
              className={inputClass}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Σειρά Εμφάνισης">
              <input
                type="number"
                value={form.display_order}
                onChange={(e) =>
                  setForm((s) => ({ ...s, display_order: e.target.value }))
                }
                className={inputClass}
              />
            </Field>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) =>
                  setForm((s) => ({ ...s, active: e.target.checked }))
                }
                className="h-4 w-4 rounded border-border"
              />
              Ενεργό
            </label>
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
                  : "Δημιουργία"}
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
  children: ReactNode;
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
