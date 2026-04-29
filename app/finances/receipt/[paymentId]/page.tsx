"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { errorMessage, getBrowserClient } from "@/lib/supabase/client";
import { useClubSettings } from "@/lib/hooks/useClubSettings";
import type { Member, Payment, PaymentType } from "@/lib/supabase/types";

const PAYMENT_TYPE_LABEL: Record<PaymentType, string> = {
  monthly_fee: "Μηνιαία Συνδρομή",
  annual: "Ετήσια Συνδρομή",
};

const eur = new Intl.NumberFormat("el-GR", {
  style: "currency",
  currency: "EUR",
});

type ReceiptData = {
  payment: Payment;
  member: Pick<Member, "first_name" | "last_name" | "email" | "phone"> | null;
};

export default function ReceiptPage() {
  const params = useParams<{ paymentId: string }>();
  const paymentId = params?.paymentId;
  const { settings: club } = useClubSettings();

  const [data, setData] = useState<ReceiptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!paymentId) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = getBrowserClient();
        const { data: row, error: qErr } = await supabase
          .from("payments")
          .select("*, members(first_name,last_name,email,phone)")
          .eq("id", paymentId)
          .single();
        if (cancelled) return;
        if (qErr) throw qErr;
        const r = row as Payment & {
          members?: ReceiptData["member"];
        };
        setData({
          payment: {
            id: r.id,
            member_id: r.member_id,
            amount: r.amount,
            payment_date: r.payment_date,
            type: r.type,
            period: r.period,
            created_at: r.created_at,
          },
          member: r.members ?? null,
        });
      } catch (err) {
        if (!cancelled)
          setError(errorMessage(err, "Σφάλμα φόρτωσης απόδειξης."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [paymentId]);

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl p-10 text-center text-muted">
        Φόρτωση…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-2xl p-10 text-center text-danger">
        {error ?? "Δεν βρέθηκε η απόδειξη."}
      </div>
    );
  }

  const { payment, member } = data;
  const memberName = member
    ? `${member.last_name ?? ""} ${member.first_name ?? ""}`.trim()
    : "—";
  const receiptNo = payment.id.slice(0, 8).toUpperCase();
  const periodLabel = payment.period
    ? payment.type === "annual"
      ? `Έτος ${payment.period}`
      : payment.period
    : "—";

  return (
    <div className="mx-auto max-w-3xl p-6 print:p-0">
      <div className="mb-4 flex justify-end gap-2 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90"
        >
          Εκτύπωση / Αποθήκευση ως PDF
        </button>
        <button
          type="button"
          onClick={() => window.close()}
          className="rounded-lg border border-border px-4 py-2 text-sm transition hover:bg-background"
        >
          Κλείσιμο
        </button>
      </div>

      <div className="rounded-xl border border-border bg-surface p-8 shadow-sm print:border-0 print:shadow-none">
        <header className="mb-8 flex items-start justify-between gap-4 border-b border-border pb-6">
          <div className="flex items-center gap-4">
            {club.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={club.logo_url}
                alt={club.club_name}
                className="h-14 w-14 shrink-0 rounded-lg object-cover"
              />
            )}
            <div>
              <h1 className="text-2xl font-semibold">{club.club_name}</h1>
              <p className="mt-1 text-sm text-muted">
                Απόδειξη Είσπραξης Συνδρομής
              </p>
              {(club.address || club.phone || club.email) && (
                <p className="mt-1 text-[11px] text-muted">
                  {[club.address, club.phone, club.email]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
            </div>
          </div>
          <div className="text-right text-sm">
            <p className="text-muted">Αρ. Απόδειξης</p>
            <p className="font-mono font-semibold">{receiptNo}</p>
            <p className="mt-2 text-muted">Ημερομηνία</p>
            <p className="font-medium">
              {new Date(payment.payment_date).toLocaleDateString("el-GR")}
            </p>
          </div>
        </header>

        <section className="mb-8">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
            Στοιχεία Μέλους
          </h2>
          <p className="text-lg font-medium">{memberName}</p>
          {member?.email && (
            <p className="text-sm text-muted">{member.email}</p>
          )}
          {member?.phone && (
            <p className="text-sm text-muted">{member.phone}</p>
          )}
        </section>

        <section className="mb-8">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
            Στοιχεία Πληρωμής
          </h2>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              <tr>
                <td className="py-2 text-muted">Τύπος</td>
                <td className="py-2 text-right font-medium">
                  {PAYMENT_TYPE_LABEL[payment.type]}
                </td>
              </tr>
              <tr>
                <td className="py-2 text-muted">Περίοδος</td>
                <td className="py-2 text-right font-medium">{periodLabel}</td>
              </tr>
              <tr>
                <td className="py-3 text-base font-semibold">Σύνολο</td>
                <td className="py-3 text-right text-lg font-semibold">
                  {eur.format(Number(payment.amount))}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <footer className="mt-12 grid grid-cols-2 gap-8 border-t border-border pt-6 text-xs text-muted">
          <div>
            <p className="mb-12">Ο Καταβάλλων</p>
            <p className="border-t border-border pt-1 text-center">
              Υπογραφή
            </p>
          </div>
          <div>
            <p className="mb-12">Ο Εισπράττων</p>
            <p className="border-t border-border pt-1 text-center">
              Υπογραφή & Σφραγίδα
            </p>
          </div>
        </footer>
      </div>

      <style jsx global>{`
        @media print {
          body {
            background: white !important;
          }
          aside,
          nav {
            display: none !important;
          }
          main {
            padding: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}
