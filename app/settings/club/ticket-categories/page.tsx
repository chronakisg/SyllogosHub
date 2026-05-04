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
import {
  TICKET_CATEGORY_KIND_LABELS,
  TICKET_CATEGORY_KINDS,
  type TicketCategory,
  type TicketCategoryInsert,
  type TicketCategoryKind,
} from "@/lib/supabase/types";
const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

const KIND_BADGE: Record<TicketCategoryKind, string> = {
  adult:
    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  child:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  other: "bg-foreground/10 text-muted",
};

type Form = {
  name: string;
  short_label: string;
  category_kind: TicketCategoryKind;
  default_price: string;
  notes: string;
};

function emptyForm(): Form {
  return {
    name: "",
    short_label: "",
    category_kind: "adult",
    default_price: "",
    notes: "",
  };
}

function formFromCategory(c: TicketCategory): Form {
  return {
    name: c.name,
    short_label: c.short_label ?? "",
    category_kind: c.category_kind,
    default_price: c.default_price != null ? String(c.default_price) : "",
    notes: c.notes ?? "",
  };
}

function formatEuro(amount: number): string {
  return new Intl.NumberFormat("el-GR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function parsePrice(raw: string): number | null {
  const trimmed = raw.trim().replace(",", ".");
  if (!trimmed) return null;
  const n = parseFloat(trimmed);
  return isNaN(n) ? NaN : n;
}

export default function TicketCategoriesPage() {
  const role = useRole();
  const { clubId, loading: clubLoading } = useCurrentClub();

  const [categories, setCategories] = useState<TicketCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TicketCategory | null>(null);
  const [form, setForm] = useState<Form>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [reorderingId, setReorderingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!clubId) return;
    try {
      const supabase = getBrowserClient();
      const { data, error: err } = await supabase
        .from("ticket_categories")
        .select("*")
        .eq("club_id", clubId)
        .order("is_archived", { ascending: true })
        .order("display_order", { ascending: true });
      if (err) throw err;
      setCategories((data ?? []) as TicketCategory[]);
      setError(null);
    } catch (err) {
      setError(errorMessage(err, "Σφάλμα φόρτωσης κατηγοριών."));
    } finally {
      setLoading(false);
    }
  }, [clubId]);

  useEffect(() => {
    if (clubLoading) return;
    load();
  }, [load, clubLoading]);

  const active = useMemo(
    () =>
      categories
        .filter((c) => !c.is_archived)
        .sort((a, b) => a.display_order - b.display_order),
    [categories]
  );

  const archived = useMemo(
    () => categories.filter((c) => c.is_archived),
    [categories]
  );

  const nextOrder = useMemo(
    () =>
      active.length === 0
        ? 1
        : Math.max(...active.map((c) => c.display_order)) + 1,
    [active]
  );

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(c: TicketCategory) {
    setEditing(c);
    setForm(formFromCategory(c));
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setModalOpen(false);
    setEditing(null);
  }

  function validateForm(): string | null {
    if (!form.name.trim()) return "Το όνομα είναι υποχρεωτικό.";
    if (form.default_price.trim()) {
      const p = parsePrice(form.default_price);
      if (p === null || isNaN(p) || p < 0)
        return "Η τιμή πρέπει να είναι θετικός αριθμός.";
    }
    return null;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    if (!clubId) {
      setFormError("Δεν έχει εντοπιστεί σύλλογος.");
      return;
    }
    const validationError = validateForm();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    const name = form.name.trim();
    const price = parsePrice(form.default_price);
    const patch = {
      name,
      short_label: form.short_label.trim() || null,
      category_kind: form.category_kind,
      default_price: price,
      notes: form.notes.trim() || null,
    };

    setSaving(true);
    const supabase = getBrowserClient();

    if (editing) {
      const snapshot = editing;
      const optimistic: TicketCategory = { ...snapshot, ...patch };
      setCategories((prev) =>
        prev.map((c) => (c.id === snapshot.id ? optimistic : c))
      );
      setModalOpen(false);
      setEditing(null);
      setSaving(false);
      try {
        const { error: uErr } = await supabase
          .from("ticket_categories")
          .update(patch)
          .eq("id", snapshot.id)
          .eq("club_id", clubId);
        if (uErr) throw uErr;
      } catch (err) {
        setCategories((prev) =>
          prev.map((c) => (c.id === snapshot.id ? snapshot : c))
        );
        setError(errorMessage(err, "Σφάλμα αποθήκευσης κατηγορίας."));
      }
    } else {
      try {
        const insert: TicketCategoryInsert = {
          club_id: clubId,
          display_order: nextOrder,
          ...patch,
        };
        const { data: row, error: iErr } = await supabase
          .from("ticket_categories")
          .insert(insert)
          .select()
          .single();
        if (iErr) throw iErr;
        setCategories((prev) => [...prev, row as TicketCategory]);
        setModalOpen(false);
        setEditing(null);
      } catch (err) {
        const raw = err as { code?: string };
        if (raw?.code === "23505") {
          setFormError(`Υπάρχει ήδη κατηγορία με το όνομα «${name}».`);
        } else {
          setFormError(errorMessage(err, "Σφάλμα δημιουργίας κατηγορίας."));
        }
      } finally {
        setSaving(false);
      }
    }
  }

  async function handleArchive(c: TicketCategory) {
    if (!clubId) return;
    const confirmed = window.confirm(
      `Αρχειοθέτηση κατηγορίας «${c.name}»;\nΔεν θα εμφανίζεται σε νέες εκδηλώσεις.`
    );
    if (!confirmed) return;
    setCategories((prev) =>
      prev.map((x) => (x.id === c.id ? { ...x, is_archived: true } : x))
    );
    try {
      const supabase = getBrowserClient();
      const { error: uErr } = await supabase
        .from("ticket_categories")
        .update({ is_archived: true })
        .eq("id", c.id)
        .eq("club_id", clubId);
      if (uErr) throw uErr;
    } catch (err) {
      setCategories((prev) =>
        prev.map((x) => (x.id === c.id ? { ...x, is_archived: false } : x))
      );
      setError(errorMessage(err, "Σφάλμα αρχειοθέτησης κατηγορίας."));
    }
  }

  async function handleRestore(c: TicketCategory) {
    if (!clubId) return;
    const restoredOrder = nextOrder;
    setCategories((prev) =>
      prev.map((x) =>
        x.id === c.id
          ? { ...x, is_archived: false, display_order: restoredOrder }
          : x
      )
    );
    try {
      const supabase = getBrowserClient();
      const { error: uErr } = await supabase
        .from("ticket_categories")
        .update({ is_archived: false, display_order: restoredOrder })
        .eq("id", c.id)
        .eq("club_id", clubId);
      if (uErr) throw uErr;
    } catch (err) {
      setCategories((prev) => prev.map((x) => (x.id === c.id ? c : x)));
      setError(errorMessage(err, "Σφάλμα επαναφοράς κατηγορίας."));
    }
  }

  async function handleReorder(c: TicketCategory, direction: -1 | 1) {
    if (reorderingId !== null || !clubId) return;
    const idx = active.findIndex((x) => x.id === c.id);
    const swap = active[idx + direction];
    if (!swap) return;

    setReorderingId(c.id);
    setCategories((prev) =>
      prev.map((x) => {
        if (x.id === c.id) return { ...x, display_order: swap.display_order };
        if (x.id === swap.id) return { ...x, display_order: c.display_order };
        return x;
      })
    );

    try {
      const supabase = getBrowserClient();
      const [r1, r2] = await Promise.all([
        supabase
          .from("ticket_categories")
          .update({ display_order: swap.display_order })
          .eq("id", c.id)
          .eq("club_id", clubId),
        supabase
          .from("ticket_categories")
          .update({ display_order: c.display_order })
          .eq("id", swap.id)
          .eq("club_id", clubId),
      ]);
      if (r1.error) throw r1.error;
      if (r2.error) throw r2.error;
    } catch (err) {
      setCategories((prev) =>
        prev.map((x) => {
          if (x.id === c.id) return { ...x, display_order: c.display_order };
          if (x.id === swap.id)
            return { ...x, display_order: swap.display_order };
          return x;
        })
      );
      setError(errorMessage(err, "Σφάλμα αλλαγής σειράς."));
    } finally {
      setReorderingId(null);
    }
  }

  if (role.loading || clubLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl p-10 text-center text-muted">
        Φόρτωση…
      </div>
    );
  }
  if (role.userId && !role.permissions.includes("settings")) {
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
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm text-muted">
            Ρυθμίσεις › Κατηγορίες Προσκλήσεων
          </p>
          <h1 className="mt-0.5 text-xl font-semibold tracking-tight">
            Κατηγορίες Προσκλήσεων
          </h1>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90"
        >
          + Νέα Κατηγορία
        </button>
      </header>

      <p className="mb-4 text-sm text-muted">
        Καθορίστε τις κατηγορίες προσκλήσεων που χρησιμοποιεί ο σύλλογος.
        Σε κάθε εκδήλωση επιλέγετε από αυτές και ορίζετε την τιμή.
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Active categories */}
      <section className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="border-b border-border bg-background/40 px-4 py-2.5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
            Ενεργές κατηγορίες
          </h2>
        </div>
        {loading ? (
          <p className="p-6 text-center text-sm text-muted">Φόρτωση…</p>
        ) : active.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted">
            Δεν έχουν οριστεί κατηγορίες ακόμα. Πατήστε «+ Νέα Κατηγορία»
            για να ξεκινήσετε.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-background/40 text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-3 py-2">Όνομα</th>
                <th className="px-3 py-2">Σύντμηση</th>
                <th className="px-3 py-2">Τύπος</th>
                <th className="px-3 py-2 text-right">Προτ. τιμή</th>
                <th className="px-3 py-2 text-right">Ενέργειες</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {active.map((c, idx) => (
                <tr key={c.id}>
                  <td className="px-3 py-2 font-medium">{c.name}</td>
                  <td className="px-3 py-2 text-muted">
                    {c.short_label ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        "rounded-full px-2 py-0.5 text-xs font-medium " +
                        KIND_BADGE[c.category_kind]
                      }
                    >
                      {TICKET_CATEGORY_KIND_LABELS[c.category_kind]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-muted">
                    {c.default_price != null ? formatEuro(c.default_price) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => handleReorder(c, -1)}
                        disabled={idx === 0 || reorderingId !== null}
                        className="rounded-md border border-border px-2 py-1 text-[11px] transition hover:bg-foreground/5 disabled:opacity-40"
                        title="Μετακίνηση πάνω"
                        aria-label="Μετακίνηση πάνω"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReorder(c, 1)}
                        disabled={
                          idx === active.length - 1 || reorderingId !== null
                        }
                        className="rounded-md border border-border px-2 py-1 text-[11px] transition hover:bg-foreground/5 disabled:opacity-40"
                        title="Μετακίνηση κάτω"
                        aria-label="Μετακίνηση κάτω"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(c)}
                        className="rounded-md border border-border px-2 py-1 text-[11px] transition hover:bg-foreground/5"
                        title="Επεξεργασία"
                        aria-label="Επεξεργασία"
                      >
                        ✏
                      </button>
                      <button
                        type="button"
                        onClick={() => handleArchive(c)}
                        className="rounded-md border border-border px-2 py-1 text-[11px] text-muted transition hover:bg-foreground/5"
                        title="Αρχειοθέτηση"
                        aria-label="Αρχειοθέτηση"
                      >
                        🗄
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Archived section */}
      {archived.length > 0 && (
        <section className="mt-4 overflow-hidden rounded-xl border border-border bg-surface">
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-foreground/5"
          >
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">
              Αρχειοθετημένες ({archived.length})
            </span>
            <span className="text-muted">{showArchived ? "▲" : "▾"}</span>
          </button>
          {showArchived && (
            <div className="border-t border-border">
              <table className="w-full text-left text-sm">
                <tbody className="divide-y divide-border">
                  {archived.map((c) => (
                    <tr key={c.id} className="opacity-60">
                      <td className="px-3 py-2 font-medium">{c.name}</td>
                      <td className="px-3 py-2">
                        <span
                          className={
                            "rounded-full px-2 py-0.5 text-xs font-medium " +
                            KIND_BADGE[c.category_kind]
                          }
                        >
                          {TICKET_CATEGORY_KIND_LABELS[c.category_kind]}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-muted">
                        {c.default_price != null
                          ? formatEuro(c.default_price)
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => handleRestore(c)}
                          className="rounded-md border border-border px-2 py-1 text-[11px] transition hover:bg-foreground/5"
                          title="Επαναφορά"
                          aria-label="Επαναφορά κατηγορίας"
                        >
                          ↻ Επαναφορά
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {modalOpen && (
        <CategoryModal
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

function CategoryModal({
  editing,
  form,
  setForm,
  saving,
  formError,
  onClose,
  onSubmit,
}: {
  editing: TicketCategory | null;
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
          {editing ? "Επεξεργασία Κατηγορίας" : "Νέα Κατηγορία"}
        </h2>
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Όνομα" required>
            <input
              type="text"
              required
              autoFocus
              value={form.name}
              onChange={(e) =>
                setForm((s) => ({ ...s, name: e.target.value }))
              }
              placeholder="π.χ. Ενήλικας, Παιδί"
              className={inputClass}
            />
          </Field>

          <Field label="Σύντμηση">
            <input
              type="text"
              value={form.short_label}
              onChange={(e) =>
                setForm((s) => ({ ...s, short_label: e.target.value }))
              }
              placeholder="π.χ. Ενήλ."
              maxLength={10}
              className={inputClass}
            />
          </Field>

          {/* Radio group — standalone div to avoid nested <label> */}
          <div>
            <span className="mb-1.5 block text-xs font-medium text-muted">
              Τύπος
            </span>
            <div className="flex flex-wrap gap-2">
              {TICKET_CATEGORY_KINDS.map((kind) => (
                <label
                  key={kind}
                  className={
                    "flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition " +
                    (form.category_kind === kind
                      ? "border-accent bg-accent/10 font-medium text-accent"
                      : "border-border hover:bg-foreground/5")
                  }
                >
                  <input
                    type="radio"
                    name="category_kind"
                    value={kind}
                    checked={form.category_kind === kind}
                    onChange={() =>
                      setForm((s) => ({ ...s, category_kind: kind }))
                    }
                    className="sr-only"
                  />
                  {TICKET_CATEGORY_KIND_LABELS[kind]}
                </label>
              ))}
            </div>
          </div>

          <Field label="Προτεινόμενη Τιμή">
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={form.default_price}
                onChange={(e) =>
                  setForm((s) => ({ ...s, default_price: e.target.value }))
                }
                placeholder="π.χ. 25.00"
                className={inputClass}
              />
              <span className="shrink-0 text-sm text-muted">€</span>
            </div>
          </Field>

          <Field label="Σημειώσεις">
            <textarea
              value={form.notes}
              onChange={(e) =>
                setForm((s) => ({ ...s, notes: e.target.value }))
              }
              rows={2}
              className={inputClass}
            />
          </Field>

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
