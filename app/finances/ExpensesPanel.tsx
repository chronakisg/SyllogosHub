"use client";

import { useEffect, useMemo, useState } from "react";
import { errorMessage, getBrowserClient } from "@/lib/supabase/client";
import type {
  EventExpense,
  EventExpenseInsert,
  ExpenseCategory,
} from "@/lib/supabase/types";
import { formatEuro } from "@/lib/utils/eventRevenue";

// ── Types ────────────────────────────────────────────────────

type ExpenseRow = {
  id?: string;
  category_id: string;
  amount: string;
  description: string;
  is_paid: boolean;
  paid_at: string;
};

// ── Helpers ──────────────────────────────────────────────────

const inputClass =
  "rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

function toRow(e: EventExpense): ExpenseRow {
  return {
    id: e.id,
    category_id: e.category_id,
    amount: String(e.amount),
    description: e.description ?? "",
    is_paid: e.paid_at !== null,
    paid_at: e.paid_at ? e.paid_at.slice(0, 10) : "",
  };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Main component ───────────────────────────────────────────

export default function ExpensesPanel({
  eventId,
  clubId,
  onExpensesChange,
}: {
  eventId: string;
  clubId: string;
  onExpensesChange?: (expenses: EventExpense[]) => void;
}) {
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── Load ──────────────────────────────────────────────────

  useEffect(() => {
    if (!eventId || !clubId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSaveError(null);

    (async () => {
      try {
        const supabase = getBrowserClient();
        const [catRes, expRes] = await Promise.all([
          supabase
            .from("expense_categories")
            .select("*")
            .eq("club_id", clubId)
            .eq("is_archived", false)
            .order("display_order", { ascending: true }),
          supabase
            .from("event_expenses")
            .select("*")
            .eq("event_id", eventId)
            .order("created_at", { ascending: true }),
        ]);
        if (cancelled) return;
        if (catRes.error) throw catRes.error;
        if (expRes.error) throw expRes.error;
        setCategories((catRes.data ?? []) as ExpenseCategory[]);
        setExpenses(((expRes.data ?? []) as EventExpense[]).map(toRow));
      } catch (err) {
        if (!cancelled)
          setError(errorMessage(err, "Σφάλμα φόρτωσης εξόδων."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [eventId, clubId]);

  // ── Row helpers ───────────────────────────────────────────

  function addExpense() {
    setExpenses((prev) => [
      ...prev,
      {
        category_id: categories[0]?.id ?? "",
        amount: "",
        description: "",
        is_paid: false,
        paid_at: "",
      },
    ]);
  }

  function removeExpense(idx: number) {
    setExpenses((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateExpense(idx: number, patch: Partial<ExpenseRow>) {
    setExpenses((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, ...patch } : row))
    );
  }

  // ── Summary ───────────────────────────────────────────────

  const summary = useMemo(() => {
    let paid = 0;
    let pending = 0;
    for (const e of expenses) {
      const n = Number(e.amount.replace(",", ".")) || 0;
      if (e.is_paid) paid += n;
      else pending += n;
    }
    return { paid, pending, total: paid + pending };
  }, [expenses]);

  // ── Save ──────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true);
    setSaveError(null);

    try {
      const cleanRows: Omit<EventExpenseInsert, "event_id" | "club_id">[] = [];

      for (let i = 0; i < expenses.length; i++) {
        const e = expenses[i];

        if (!e.category_id) {
          throw new Error(`Επιλέξτε κατηγορία στη γραμμή ${i + 1}.`);
        }

        const amountNum = Number(e.amount.replace(",", "."));
        if (!Number.isFinite(amountNum) || amountNum <= 0) {
          throw new Error(
            `Το ποσό στη γραμμή ${i + 1} δεν είναι έγκυρο (πρέπει > 0).`
          );
        }

        if (e.is_paid && !e.paid_at) {
          throw new Error(
            `Επιλέξτε ημερομηνία πληρωμής στη γραμμή ${i + 1}.`
          );
        }

        cleanRows.push({
          category_id: e.category_id,
          amount: amountNum,
          description: e.description.trim() || null,
          paid_at: e.is_paid ? e.paid_at : null,
        });
      }

      const supabase = getBrowserClient();

      const { error: delErr } = await supabase
        .from("event_expenses")
        .delete()
        .eq("event_id", eventId);
      if (delErr) throw delErr;

      let insertedExpenses: EventExpense[] = [];
      if (cleanRows.length > 0) {
        const rows: EventExpenseInsert[] = cleanRows.map((r) => ({
          ...r,
          event_id: eventId,
          club_id: clubId,
        }));
        const { data: ins, error: insErr } = await supabase
          .from("event_expenses")
          .insert(rows)
          .select("*");
        if (insErr) throw insErr;
        insertedExpenses = (ins ?? []) as EventExpense[];
      }

      onExpensesChange?.(insertedExpenses);
      setExpenses(insertedExpenses.map(toRow));
    } catch (err) {
      setSaveError(errorMessage(err, "Σφάλμα αποθήκευσης εξόδων."));
    } finally {
      setSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-8 w-48 animate-pulse rounded-lg border border-border bg-surface" />
        <div className="h-32 animate-pulse rounded-lg border border-border bg-surface" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
        {error}
      </div>
    );
  }

  // Edge case: no categories configured for this club
  if (categories.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-background/50 p-6 text-center text-sm text-muted">
        Δεν υπάρχουν κατηγορίες εξόδων.{" "}
        <a
          href="/settings/club/expense-categories"
          className="underline hover:text-foreground"
        >
          Δημιούργησε στο Ρυθμίσεις › Κατηγορίες Εξόδων
        </a>
        .
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header: title + summary */}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
          💸 Έξοδα Εκδήλωσης
        </h2>
        {expenses.length > 0 && (
          <p className="text-xs text-muted">
            Σύνολο:{" "}
            <span className="font-medium text-foreground">
              {formatEuro(summary.total)}
            </span>{" "}
            • Πληρωμένα:{" "}
            <span className="text-emerald-600 dark:text-emerald-400">
              {formatEuro(summary.paid)}
            </span>{" "}
            • Εκκρεμή:{" "}
            <span className={summary.pending > 0 ? "text-amber-600 dark:text-amber-400" : ""}>
              {formatEuro(summary.pending)}
            </span>
          </p>
        )}
      </div>

      {/* Table or empty state */}
      {expenses.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted">
          Δεν έχουν καταχωρηθεί έξοδα. Προσθέστε το πρώτο.
        </p>
      ) : (
        <div className="overflow-x-auto overflow-hidden rounded-lg border border-border">
          <table className="w-full table-fixed text-sm">
            <thead className="border-b border-border bg-background/50 text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="w-[20%] px-3 py-2 text-left">Κατηγορία</th>
                <th className="w-[35%] px-3 py-2 text-left">Περιγραφή</th>
                <th className="w-[15%] px-3 py-2 text-right">Ποσό €</th>
                <th className="w-[25%] px-3 py-2 text-left">Πληρωμή</th>
                <th className="w-[5%] px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {expenses.map((e, i) => (
                <tr key={i} className="bg-background">
                  {/* Κατηγορία */}
                  <td className="px-3 py-2">
                    <select
                      value={e.category_id}
                      onChange={(ev) =>
                        updateExpense(i, { category_id: ev.target.value })
                      }
                      className={inputClass + " w-full"}
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.icon ? `${c.icon} ` : ""}
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </td>

                  {/* Περιγραφή */}
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={e.description}
                      onChange={(ev) =>
                        updateExpense(i, { description: ev.target.value })
                      }
                      placeholder="Σύντομη περιγραφή…"
                      maxLength={100}
                      className={inputClass + " w-full"}
                    />
                  </td>

                  {/* Ποσό */}
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      inputMode="decimal"
                      value={e.amount}
                      onChange={(ev) =>
                        updateExpense(i, { amount: ev.target.value })
                      }
                      placeholder="0.00"
                      className={inputClass + " w-full text-right"}
                    />
                  </td>

                  {/* Πληρωμή */}
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={e.is_paid}
                        onChange={(ev) =>
                          updateExpense(i, {
                            is_paid: ev.target.checked,
                            paid_at: ev.target.checked ? today() : "",
                          })
                        }
                        className="accent-accent"
                      />
                      {e.is_paid && (
                        <input
                          type="date"
                          value={e.paid_at}
                          onChange={(ev) =>
                            updateExpense(i, { paid_at: ev.target.value })
                          }
                          className={inputClass + " w-full"}
                        />
                      )}
                    </div>
                  </td>

                  {/* Delete */}
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => removeExpense(i)}
                      aria-label="Διαγραφή"
                      className="rounded-md border border-danger/30 px-2 py-1 text-[12px] text-danger transition hover:bg-danger/10"
                    >
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* + Προσθήκη */}
      <button
        type="button"
        onClick={addExpense}
        className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition hover:bg-foreground/5"
      >
        + Προσθήκη Εξόδου
      </button>

      {/* Summary footer (visible when rows exist) */}
      {expenses.length > 0 && (
        <div className="rounded-lg border border-border bg-background/50 px-4 py-3 text-xs">
          <div className="flex justify-between">
            <span className="text-muted">Πληρωμένα</span>
            <span className="font-medium text-emerald-600 dark:text-emerald-400">
              {formatEuro(summary.paid)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Εκκρεμή</span>
            <span className={
              "font-medium " +
              (summary.pending > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted")
            }>
              {formatEuro(summary.pending)}
            </span>
          </div>
          <div className="mt-1.5 flex justify-between border-t border-border pt-1.5">
            <span className="font-medium">Σύνολο Εξόδων</span>
            <span className="font-semibold">{formatEuro(summary.total)}</span>
          </div>
        </div>
      )}

      {/* Save error */}
      {saveError && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          <span>{saveError}</span>
          <button
            type="button"
            onClick={() => setSaveError(null)}
            className="shrink-0 rounded px-2 text-xs hover:opacity-70"
          >
            ✕
          </button>
        </div>
      )}

      {/* Save button */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Αποθήκευση…" : "Αποθήκευση Αλλαγών"}
        </button>
      </div>
    </div>
  );
}
