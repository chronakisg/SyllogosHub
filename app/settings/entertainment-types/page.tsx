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
  EntertainmentType,
  EntertainmentTypeInsert,
  EntertainmentTypeUpdate,
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

export default function EntertainmentTypesPage() {
  const role = useRole();
  const { clubId, loading: clubLoading } = useCurrentClub();
  const [types, setTypes] = useState<EntertainmentType[]>([]);
  const [counts, setCounts] = useState<
    Map<string, { entertainers: number; events: number }>
  >(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<EntertainmentType | null>(null);
  const [form, setForm] = useState<Form>(emptyForm(0));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!clubId) return;
    try {
      const supabase = getBrowserClient();
      const [tRes, entRes, evtRes] = await Promise.all([
        supabase
          .from("entertainment_types")
          .select("*")
          .eq("club_id", clubId)
          .order("display_order", { ascending: true })
          .order("name", { ascending: true }),
        supabase
          .from("entertainers")
          .select("entertainment_type_id")
          .eq("club_id", clubId)
          .not("entertainment_type_id", "is", null),
        supabase
          .from("event_entertainers")
          .select("event_id, entertainers!inner(entertainment_type_id)")
          .eq("club_id", clubId),
      ]);
      if (tRes.error) throw tRes.error;
      if (entRes.error) throw entRes.error;
      if (evtRes.error) throw evtRes.error;
      setTypes((tRes.data ?? []) as EntertainmentType[]);
      const counter = new Map<
        string,
        { entertainers: number; events: Set<string> }
      >();
      for (const r of entRes.data ?? []) {
        const id = (r as { entertainment_type_id: string | null })
          .entertainment_type_id;
        if (!id) continue;
        const cur = counter.get(id) ?? {
          entertainers: 0,
          events: new Set<string>(),
        };
        cur.entertainers += 1;
        counter.set(id, cur);
      }
      type EvtJoinRow = {
        event_id: string;
        entertainers:
          | { entertainment_type_id: string | null }
          | { entertainment_type_id: string | null }[]
          | null;
      };
      for (const r of (evtRes.data ?? []) as unknown as EvtJoinRow[]) {
        const ent = Array.isArray(r.entertainers)
          ? r.entertainers[0]
          : r.entertainers;
        const typeId = ent?.entertainment_type_id ?? null;
        if (!typeId) continue;
        const cur = counter.get(typeId) ?? {
          entertainers: 0,
          events: new Set<string>(),
        };
        cur.events.add(r.event_id);
        counter.set(typeId, cur);
      }
      const merged = new Map<
        string,
        { entertainers: number; events: number }
      >();
      for (const [k, v] of counter) {
        merged.set(k, { entertainers: v.entertainers, events: v.events.size });
      }
      setCounts(merged);
      setError(null);
    } catch (err) {
      setError(errorMessage(err, "Σφάλμα φόρτωσης ειδών ψυχαγωγίας."));
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
      types.length === 0
        ? 1
        : Math.max(...types.map((t) => t.display_order)) + 1,
    [types]
  );

  function openCreate() {
    setEditing(null);
    setForm(emptyForm(nextOrder));
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(t: EntertainmentType) {
    setEditing(t);
    setForm({
      name: t.name,
      description: t.description ?? "",
      display_order: String(t.display_order),
      active: t.active,
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
        const update: EntertainmentTypeUpdate = {
          name,
          description: form.description.trim() || null,
          display_order: order,
          active: form.active,
        };
        const { error: uErr } = await supabase
          .from("entertainment_types")
          .update(update)
          .eq("id", editing.id)
          .eq("club_id", clubId);
        if (uErr) throw uErr;
      } else {
        const insert: EntertainmentTypeInsert = {
          club_id: clubId,
          name,
          description: form.description.trim() || null,
          display_order: order,
          active: form.active,
        };
        const { error: iErr } = await supabase
          .from("entertainment_types")
          .insert(insert);
        if (iErr) throw iErr;
      }
      setModalOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      setFormError(errorMessage(err, "Σφάλμα αποθήκευσης είδους ψυχαγωγίας."));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(t: EntertainmentType) {
    if (!clubId) return;
    try {
      const supabase = getBrowserClient();
      const { error: uErr } = await supabase
        .from("entertainment_types")
        .update({ active: !t.active })
        .eq("id", t.id)
        .eq("club_id", clubId);
      if (uErr) throw uErr;
      await load();
    } catch (err) {
      setError(errorMessage(err, "Σφάλμα ενημέρωσης κατάστασης."));
    }
  }

  async function move(t: EntertainmentType, direction: -1 | 1) {
    if (!clubId) return;
    const sorted = [...types].sort(
      (a, b) => a.display_order - b.display_order
    );
    const idx = sorted.findIndex((x) => x.id === t.id);
    const swap = sorted[idx + direction];
    if (!swap) return;
    try {
      const supabase = getBrowserClient();
      const { error: e1 } = await supabase
        .from("entertainment_types")
        .update({ display_order: swap.display_order })
        .eq("id", t.id)
        .eq("club_id", clubId);
      if (e1) throw e1;
      const { error: e2 } = await supabase
        .from("entertainment_types")
        .update({ display_order: t.display_order })
        .eq("id", swap.id)
        .eq("club_id", clubId);
      if (e2) throw e2;
      await load();
    } catch (err) {
      setError(errorMessage(err, "Σφάλμα αλλαγής σειράς."));
    }
  }

  async function handleDelete(t: EntertainmentType) {
    const c = counts.get(t.id);
    const entCount = c?.entertainers ?? 0;
    const evtCount = c?.events ?? 0;
    let msg: string;
    if (entCount === 0 && evtCount === 0) {
      msg = `Διαγραφή «${t.name}»;`;
    } else {
      msg =
        `Ο τύπος «${t.name}» χρησιμοποιείται από ${entCount} ${
          entCount === 1 ? "ψυχαγωγό" : "ψυχαγωγούς"
        } σε ${evtCount} ${
          evtCount === 1 ? "εκδήλωση" : "εκδηλώσεις"
        }. Είστε σίγουροι;`;
    }
    if (!window.confirm(msg)) return;
    if (!clubId) return;
    try {
      const supabase = getBrowserClient();
      const { error: dErr } = await supabase
        .from("entertainment_types")
        .delete()
        .eq("id", t.id)
        .eq("club_id", clubId);
      if (dErr) throw dErr;
      await load();
    } catch (err) {
      setError(errorMessage(err, "Σφάλμα διαγραφής."));
    }
  }

  if (role.loading) {
    return (
      <div className="mx-auto w-full max-w-5xl p-10 text-center text-muted">
        Φόρτωση…
      </div>
    );
  }
  if (role.userId && !role.permissions.includes("events")) {
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
          <p className="text-sm text-muted">Ρυθμίσεις › Είδη Ψυχαγωγίας</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Είδη Ψυχαγωγίας
          </h1>
          <p className="mt-1 text-sm text-muted">
            Διαχειριστείτε τους διαθέσιμους τύπους ψυχαγωγίας για τις
            εκδηλώσεις του συλλόγου σας.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90"
        >
          + Νέο Είδος
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
        ) : types.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted">
            Δεν υπάρχουν είδη ακόμη. Πατήστε «Νέο Είδος».
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-background/40 text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-3 py-2 w-12">#</th>
                <th className="px-3 py-2">Όνομα</th>
                <th className="px-3 py-2">Περιγραφή</th>
                <th className="px-3 py-2 text-right">Χρήση</th>
                <th className="px-3 py-2 text-center">Active</th>
                <th className="px-3 py-2 text-right">Ενέργειες</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {types.map((t, idx) => (
                <tr key={t.id}>
                  <td className="px-3 py-2 text-muted">{t.display_order}</td>
                  <td className="px-3 py-2 font-medium">{t.name}</td>
                  <td className="px-3 py-2 max-w-md truncate text-xs text-muted">
                    {t.description ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-xs">
                    {(() => {
                      const c = counts.get(t.id);
                      const ent = c?.entertainers ?? 0;
                      const evt = c?.events ?? 0;
                      if (ent === 0 && evt === 0) {
                        return (
                          <span className="italic text-muted">
                            Δεν χρησιμοποιείται
                          </span>
                        );
                      }
                      return `${ent} ψυχαγωγοί · ${evt} εκδηλώσεις`;
                    })()}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => toggleActive(t)}
                      className="rounded-md border border-border px-2 py-0.5 text-xs transition hover:bg-foreground/5"
                      title={t.active ? "Απενεργοποίηση" : "Ενεργοποίηση"}
                    >
                      {t.active ? "✓" : "—"}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => move(t, -1)}
                        disabled={idx === 0}
                        className="rounded-md border border-border px-2 py-1 text-[11px] transition hover:bg-foreground/5 disabled:opacity-40"
                        title="Πάνω"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => move(t, 1)}
                        disabled={idx === types.length - 1}
                        className="rounded-md border border-border px-2 py-1 text-[11px] transition hover:bg-foreground/5 disabled:opacity-40"
                        title="Κάτω"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(t)}
                        className="rounded-md border border-border px-2 py-1 text-[11px] transition hover:bg-foreground/5"
                      >
                        ✏
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(t)}
                        className="rounded-md border border-danger/30 px-2 py-1 text-[11px] text-danger transition hover:bg-danger/10"
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
        <EntertainmentTypeModal
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

function EntertainmentTypeModal({
  editing,
  form,
  setForm,
  saving,
  formError,
  onClose,
  onSubmit,
}: {
  editing: EntertainmentType | null;
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
          {editing ? "Επεξεργασία Είδους" : "Νέο Είδος"}
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
              placeholder="π.χ. Λυράρης"
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
