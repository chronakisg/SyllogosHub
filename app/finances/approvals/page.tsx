"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { errorMessage, getBrowserClient } from "@/lib/supabase/client";
import { useRole } from "@/lib/hooks/useRole";
import { useCurrentClub } from "@/lib/hooks/useCurrentClub";
import { AccessDenied } from "@/lib/auth/AccessDenied";
import type { Payment, PaymentType } from "@/lib/supabase/types";
import { formatMemberName } from "@/lib/utils/attendees";

const PAYMENT_TYPE_LABEL: Record<PaymentType, string> = {
  monthly_fee: "Μηνιαία Συνδρομή",
  annual: "Ετήσια Συνδρομή",
};

const eur = new Intl.NumberFormat("el-GR", {
  style: "currency",
  currency: "EUR",
});

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

type PendingRow = Payment & {
  member_first_name: string | null;
  member_last_name: string | null;
  approver_first_name: string | null;
  approver_last_name: string | null;
};

export default function ApprovalsPage() {
  const role = useRole();
  const { clubId, loading: clubLoading } = useCurrentClub();
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectSaving, setRejectSaving] = useState(false);

  const isPrivileged = role.isSystemAdmin || role.isPresident;

  const load = useCallback(async () => {
    if (!clubId) return;
    try {
      const supabase = getBrowserClient();
      const { data, error: qErr } = await supabase
        .from("payments")
        .select(
          "*, member:members!member_id(first_name,last_name), approver:members!approved_by(first_name,last_name)"
        )
        .eq("club_id", clubId)
        .eq("approval_status", "pending")
        .order("created_at", { ascending: false });
      if (qErr) throw qErr;
      const pending = ((data ?? []) as unknown as Array<
        Payment & {
          member?: { first_name: string; last_name: string } | null;
          approver?: { first_name: string; last_name: string } | null;
        }
      >).map((r) => ({
        ...r,
        member_first_name: r.member?.first_name ?? null,
        member_last_name: r.member?.last_name ?? null,
        approver_first_name: r.approver?.first_name ?? null,
        approver_last_name: r.approver?.last_name ?? null,
      })) as PendingRow[];
      setRows(pending);
      setError(null);
    } catch (err) {
      setError(errorMessage(err, "Σφάλμα φόρτωσης εγκρίσεων."));
    } finally {
      setLoading(false);
    }
  }, [clubId]);

  useEffect(() => {
    if (clubLoading) return;
    load();
  }, [load, clubLoading]);

  async function approve(p: PendingRow) {
    if (!clubId || !role.memberId) return;
    setBusyId(p.id);
    try {
      const supabase = getBrowserClient();
      const { error: uErr } = await supabase
        .from("payments")
        .update({
          approval_status: "approved",
          approved_by: role.memberId,
          approved_at: new Date().toISOString(),
        })
        .eq("id", p.id)
        .eq("club_id", clubId);
      if (uErr) throw uErr;
      await load();
    } catch (err) {
      setError(errorMessage(err, "Σφάλμα έγκρισης."));
    } finally {
      setBusyId(null);
    }
  }

  function openReject(id: string) {
    setRejectId(id);
    setRejectReason("");
  }

  async function submitReject(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!rejectId || !clubId || !role.memberId) return;
    const reason = rejectReason.trim();
    if (!reason) return;
    setRejectSaving(true);
    try {
      const supabase = getBrowserClient();
      const target = rows.find((r) => r.id === rejectId);
      const existing = target?.override_reason ?? "";
      const newReason = existing
        ? `${existing} | ΑΠΟΡΡΙΨΗ: ${reason}`
        : `ΑΠΟΡΡΙΨΗ: ${reason}`;
      const { error: uErr } = await supabase
        .from("payments")
        .update({
          approval_status: "rejected",
          approved_by: role.memberId,
          approved_at: new Date().toISOString(),
          override_reason: newReason,
        })
        .eq("id", rejectId)
        .eq("club_id", clubId);
      if (uErr) throw uErr;
      setRejectId(null);
      setRejectReason("");
      await load();
    } catch (err) {
      setError(errorMessage(err, "Σφάλμα απόρριψης."));
    } finally {
      setRejectSaving(false);
    }
  }

  if (role.loading) {
    return (
      <div className="mx-auto w-full max-w-4xl p-10 text-center text-muted">
        Φόρτωση…
      </div>
    );
  }
  if (role.userId && !isPrivileged) {
    return <AccessDenied />;
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <header className="mb-3">
        <p className="text-sm text-muted">Οικονομικά</p>
        <h1 className="mt-0.5 text-xl font-semibold tracking-tight">
          Εκκρεμείς Εγκρίσεις
        </h1>
      </header>

      {error && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      {loading ? (
        <p className="rounded-xl border border-border bg-surface p-10 text-center text-muted">
          Φόρτωση…
        </p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-surface p-10 text-center text-sm text-muted">
          Δεν υπάρχουν εκκρεμείς εγκρίσεις.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((p) => {
            const memberName = formatMemberName({
              first_name: p.member_first_name,
              last_name: p.member_last_name,
            });
            const original = p.original_amount ?? p.amount;
            const finalAmt = p.amount;
            const diff = original - finalAmt;
            const pct = original > 0 ? (diff / original) * 100 : 0;
            return (
              <li
                key={p.id}
                className="rounded-xl border border-border bg-surface p-4"
              >
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {memberName} — {PAYMENT_TYPE_LABEL[p.type]}
                      {p.period ? ` ${p.period}` : ""}
                    </p>
                    <p className="text-xs text-muted">
                      Δημιουργήθηκε στις{" "}
                      {new Date(p.created_at).toLocaleString("el-GR")}
                    </p>
                  </div>
                  <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                    🟡 Εκκρεμεί
                  </span>
                </div>

                <p className="text-sm">
                  Αυτόματο: <strong>{eur.format(original)}</strong> →{" "}
                  Νέο: <strong>{eur.format(finalAmt)}</strong>{" "}
                  <span className="text-muted">
                    ({pct >= 0 ? "−" : "+"}
                    {Math.abs(pct).toFixed(0)}%)
                  </span>
                </p>

                {p.override_reason && (
                  <p className="mt-2 rounded-md border border-border bg-background/40 p-2 text-xs">
                    <span className="text-muted">Λόγος: </span>
                    {p.override_reason}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => openReject(p.id)}
                    disabled={busyId === p.id}
                    className="rounded-lg border border-danger/30 px-3 py-1.5 text-xs text-danger transition hover:bg-danger/10 disabled:opacity-50"
                  >
                    ✗ Απόρριψη
                  </button>
                  <button
                    type="button"
                    onClick={() => approve(p)}
                    disabled={busyId === p.id}
                    className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                  >
                    ✓ Έγκριση
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {rejectId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => !rejectSaving && setRejectId(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 text-lg font-semibold">Απόρριψη Πληρωμής</h2>
            <form onSubmit={submitReject} className="space-y-4">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">
                  Λόγος Απόρριψης <span className="text-danger">*</span>
                </span>
                <textarea
                  required
                  rows={4}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className={inputClass}
                />
              </label>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRejectId(null)}
                  disabled={rejectSaving}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm transition hover:bg-background disabled:opacity-50"
                >
                  Ακύρωση
                </button>
                <button
                  type="submit"
                  disabled={rejectSaving || !rejectReason.trim()}
                  className="rounded-lg bg-danger px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {rejectSaving ? "Αποθήκευση…" : "Απόρριψη"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
