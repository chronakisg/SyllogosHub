"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { errorMessage, getBrowserClient } from "@/lib/supabase/client";
import { useRole } from "@/lib/hooks/useRole";
import { useCurrentClub } from "@/lib/hooks/useCurrentClub";
import { AccessDenied } from "@/lib/auth/AccessDenied";
import type {
  DiscountContext,
  DiscountRule,
  DiscountRuleInsert,
  DiscountRuleType,
  DiscountRuleUpdate,
} from "@/lib/supabase/types";

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

type RuleForm = {
  context: DiscountContext;
  rule_type: DiscountRuleType;
  age_max: string;
  sibling_position: string;
  discount_percent: string;
  label: string;
  display_order: string;
  active: boolean;
};

function emptyRuleForm(context: DiscountContext): RuleForm {
  return {
    context,
    rule_type: "age_based",
    age_max: "",
    sibling_position: "",
    discount_percent: "",
    label: "",
    display_order: "0",
    active: true,
  };
}

export default function DiscountsPage() {
  const role = useRole();
  const { clubId, loading: clubLoading } = useCurrentClub();
  const [rules, setRules] = useState<DiscountRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DiscountRule | null>(null);
  const [form, setForm] = useState<RuleForm>(emptyRuleForm("subscription"));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!clubId) return;
    try {
      const supabase = getBrowserClient();
      const { data, error: qErr } = await supabase
        .from("discount_rules")
        .select("*")
        .eq("club_id", clubId)
        .order("context", { ascending: true })
        .order("display_order", { ascending: true });
      if (qErr) throw qErr;
      setRules((data ?? []) as DiscountRule[]);
      setError(null);
    } catch (err) {
      setError(errorMessage(err, "Σφάλμα φόρτωσης κανόνων εκπτώσεων."));
    } finally {
      setLoading(false);
    }
  }, [clubId]);

  useEffect(() => {
    if (clubLoading) return;
    load();
  }, [load, clubLoading]);

  const subscriptionRules = useMemo(
    () => rules.filter((r) => r.context === "subscription"),
    [rules]
  );
  const eventRules = useMemo(
    () => rules.filter((r) => r.context === "event_ticket"),
    [rules]
  );

  function openCreate(context: DiscountContext) {
    setEditing(null);
    setForm(emptyRuleForm(context));
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(r: DiscountRule) {
    setEditing(r);
    setForm({
      context: r.context,
      rule_type: r.rule_type,
      age_max: r.age_max != null ? String(r.age_max) : "",
      sibling_position:
        r.sibling_position != null ? String(r.sibling_position) : "",
      discount_percent: String(r.discount_percent),
      label: r.label,
      display_order: String(r.display_order),
      active: r.active,
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
    const label = form.label.trim();
    if (!label) {
      setFormError("Το label είναι υποχρεωτικό.");
      return;
    }
    const percent = Number(form.discount_percent.replace(",", "."));
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      setFormError("Η έκπτωση πρέπει να είναι 0–100.");
      return;
    }
    const ageMax =
      form.rule_type === "age_based"
        ? parseInt(form.age_max, 10)
        : null;
    if (form.rule_type === "age_based" && (!Number.isFinite(ageMax!) || ageMax! < 0)) {
      setFormError("Η μέγιστη ηλικία πρέπει να είναι θετικός ακέραιος.");
      return;
    }
    const sibPos =
      form.rule_type === "sibling_order"
        ? parseInt(form.sibling_position, 10)
        : null;
    if (
      form.rule_type === "sibling_order" &&
      (!Number.isFinite(sibPos!) || sibPos! < 1)
    ) {
      setFormError("Η σειρά παιδιού πρέπει να είναι ≥ 1.");
      return;
    }
    const displayOrder = parseInt(form.display_order, 10) || 0;

    setSaving(true);
    try {
      const supabase = getBrowserClient();
      if (editing) {
        const update: DiscountRuleUpdate = {
          rule_type: form.rule_type,
          age_max: ageMax,
          sibling_position: sibPos,
          discount_percent: percent,
          label,
          display_order: displayOrder,
          active: form.active,
        };
        const { error: uErr } = await supabase
          .from("discount_rules")
          .update(update)
          .eq("id", editing.id)
          .eq("club_id", clubId);
        if (uErr) throw uErr;
      } else {
        const insert: DiscountRuleInsert = {
          club_id: clubId,
          context: form.context,
          rule_type: form.rule_type,
          age_max: ageMax,
          sibling_position: sibPos,
          discount_percent: percent,
          label,
          display_order: displayOrder,
          active: form.active,
        };
        const { error: iErr } = await supabase
          .from("discount_rules")
          .insert(insert);
        if (iErr) throw iErr;
      }
      setModalOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      setFormError(errorMessage(err, "Σφάλμα αποθήκευσης κανόνα."));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(r: DiscountRule) {
    if (!window.confirm(`Διαγραφή κανόνα «${r.label}»;`)) return;
    if (!clubId) return;
    try {
      const supabase = getBrowserClient();
      const { error: dErr } = await supabase
        .from("discount_rules")
        .delete()
        .eq("id", r.id)
        .eq("club_id", clubId);
      if (dErr) throw dErr;
      await load();
    } catch (err) {
      setError(errorMessage(err, "Σφάλμα διαγραφής."));
    }
  }

  if (role.loading) {
    return (
      <div className="mx-auto w-full max-w-6xl p-10 text-center text-muted">
        Φόρτωση…
      </div>
    );
  }
  if (role.userId && !role.permissions.includes("finances")) {
    return <AccessDenied />;
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <header className="mb-3">
        <Link
          href="/settings"
          className="inline-flex items-baseline gap-2 text-xl font-semibold tracking-tight text-foreground transition hover:text-foreground/70"
        >
          <span aria-hidden="true">←</span>
          Κανόνες Εκπτώσεων
        </Link>
      </header>

      {error && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <RulesSection
          title="Συνδρομές"
          rules={subscriptionRules}
          loading={loading}
          onCreate={() => openCreate("subscription")}
          onEdit={openEdit}
          onDelete={handleDelete}
        />
        <RulesSection
          title="Εκδηλώσεις"
          rules={eventRules}
          loading={loading}
          onCreate={() => openCreate("event_ticket")}
          onEdit={openEdit}
          onDelete={handleDelete}
        />
      </div>

      {modalOpen && (
        <RuleModal
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

function RulesSection({
  title,
  rules,
  loading,
  onCreate,
  onEdit,
  onDelete,
}: {
  title: string;
  rules: DiscountRule[];
  loading: boolean;
  onCreate: () => void;
  onEdit: (r: DiscountRule) => void;
  onDelete: (r: DiscountRule) => void;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface">
      <header className="flex items-center justify-between gap-2 border-b border-border bg-background/40 px-4 py-3">
        <h2 className="font-semibold">{title}</h2>
        <button
          type="button"
          onClick={onCreate}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition hover:bg-foreground/5"
        >
          + Νέος Κανόνας
        </button>
      </header>
      {loading ? (
        <p className="p-4 text-center text-sm text-muted">Φόρτωση…</p>
      ) : rules.length === 0 ? (
        <p className="p-4 text-center text-sm text-muted">
          Δεν υπάρχουν κανόνες ακόμη.
        </p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-background/30 text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="px-3 py-2 w-12">#</th>
              <th className="px-3 py-2">Label</th>
              <th className="px-3 py-2">Παράμετρος</th>
              <th className="px-3 py-2 text-right">Έκπτωση</th>
              <th className="px-3 py-2 text-center">Active</th>
              <th className="px-3 py-2 text-right">Ενέργειες</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rules.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 text-muted">{r.display_order}</td>
                <td className="px-3 py-2 font-medium">{r.label}</td>
                <td className="px-3 py-2 text-xs text-muted">
                  {r.rule_type === "age_based"
                    ? `ηλικία ≤ ${r.age_max}`
                    : `θέση ≥ ${r.sibling_position}`}
                </td>
                <td className="px-3 py-2 text-right">
                  −{r.discount_percent}%
                </td>
                <td className="px-3 py-2 text-center">
                  {r.active ? "✓" : "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="inline-flex justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => onEdit(r)}
                      className="rounded-md border border-border px-2 py-1 text-[11px] transition hover:bg-foreground/5"
                    >
                      Επεξ.
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(r)}
                      className="rounded-md border border-danger/30 px-2 py-1 text-[11px] text-danger transition hover:bg-danger/10"
                    >
                      ✕
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function RuleModal({
  editing,
  form,
  setForm,
  saving,
  formError,
  onClose,
  onSubmit,
}: {
  editing: DiscountRule | null;
  form: RuleForm;
  setForm: React.Dispatch<React.SetStateAction<RuleForm>>;
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
          {editing ? "Επεξεργασία Κανόνα" : "Νέος Κανόνας"}
        </h2>

        <form onSubmit={onSubmit} className="space-y-4">
          <fieldset>
            <legend className="mb-2 block text-xs font-medium text-muted">
              Πλαίσιο
            </legend>
            <div className="flex gap-2">
              {(["subscription", "event_ticket"] as const).map((opt) => {
                const active = form.context === opt;
                return (
                  <label
                    key={opt}
                    className={
                      "flex flex-1 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition " +
                      (active
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border hover:bg-foreground/5") +
                      (editing ? " cursor-not-allowed opacity-60" : "")
                    }
                  >
                    <input
                      type="radio"
                      name="context"
                      value={opt}
                      checked={active}
                      disabled={!!editing}
                      onChange={() =>
                        setForm((s) => ({ ...s, context: opt }))
                      }
                      className="h-4 w-4"
                    />
                    {opt === "subscription" ? "Συνδρομή" : "Εκδήλωση"}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 block text-xs font-medium text-muted">
              Τύπος Κανόνα <span className="text-danger">*</span>
            </legend>
            <div className="space-y-2 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="rule_type"
                  checked={form.rule_type === "age_based"}
                  onChange={() =>
                    setForm((s) => ({ ...s, rule_type: "age_based" }))
                  }
                  className="h-4 w-4"
                />
                Με βάση ηλικία
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="rule_type"
                  checked={form.rule_type === "sibling_order"}
                  onChange={() =>
                    setForm((s) => ({ ...s, rule_type: "sibling_order" }))
                  }
                  className="h-4 w-4"
                />
                Με βάση σειρά παιδιού
              </label>
            </div>
          </fieldset>

          {form.rule_type === "age_based" ? (
            <Field label="Μέγιστη Ηλικία" required>
              <input
                type="number"
                min={0}
                required
                value={form.age_max}
                onChange={(e) =>
                  setForm((s) => ({ ...s, age_max: e.target.value }))
                }
                placeholder="π.χ. 15"
                className={inputClass}
              />
            </Field>
          ) : (
            <Field label="Σειρά Παιδιού" required>
              <input
                type="number"
                min={1}
                required
                value={form.sibling_position}
                onChange={(e) =>
                  setForm((s) => ({ ...s, sibling_position: e.target.value }))
                }
                placeholder="π.χ. 2"
                className={inputClass}
              />
              <p className="mt-1 text-[11px] text-muted">
                Για &laquo;4ο και άνω&raquo; βάλε 4 — εφαρμόζεται σε 4ο, 5ο,
                ...
              </p>
            </Field>
          )}

          <Field label="Έκπτωση %" required>
            <input
              type="number"
              min={0}
              max={100}
              step="0.01"
              required
              value={form.discount_percent}
              onChange={(e) =>
                setForm((s) => ({ ...s, discount_percent: e.target.value }))
              }
              placeholder="π.χ. 25"
              className={inputClass}
            />
          </Field>

          <Field label="Label" required>
            <input
              type="text"
              required
              value={form.label}
              onChange={(e) =>
                setForm((s) => ({ ...s, label: e.target.value }))
              }
              placeholder="π.χ. 2ο παιδί (-25%)"
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
              Ενεργός
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
