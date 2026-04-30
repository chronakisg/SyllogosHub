"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { errorMessage, getBrowserClient } from "@/lib/supabase/client";
import { useClubSettings } from "@/lib/hooks/useClubSettings";
import { useCurrentClub } from "@/lib/hooks/useCurrentClub";
import { calculateAge } from "@/lib/utils/discounts";
import type {
  FamilyRole,
  Member,
  Payment,
  PaymentType,
} from "@/lib/supabase/types";

const PAYMENT_TYPE_LABEL: Record<PaymentType, string> = {
  monthly_fee: "Μηνιαία Συνδρομή",
  annual: "Ετήσια Συνδρομή",
};

const eur = new Intl.NumberFormat("el-GR", {
  style: "currency",
  currency: "EUR",
});

type ReceiptMember = Pick<
  Member,
  | "id"
  | "first_name"
  | "last_name"
  | "email"
  | "phone"
  | "family_id"
  | "family_role"
  | "birth_date"
>;

type Line = {
  payment: Payment;
  member: ReceiptMember | null;
};

export default function ReceiptPage() {
  const params = useParams<{ paymentId: string }>();
  const paymentId = params?.paymentId;
  const { settings: club } = useClubSettings();
  const { clubId, loading: clubLoading } = useCurrentClub();

  const [primary, setPrimary] = useState<Line | null>(null);
  const [batchLines, setBatchLines] = useState<Line[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!paymentId) return;
    if (clubLoading || !clubId) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = getBrowserClient();
        const { data: row, error: qErr } = await supabase
          .from("payments")
          .select(
            "*, member:members!member_id(id,first_name,last_name,email,phone,family_id,family_role,birth_date)"
          )
          .eq("id", paymentId)
          .eq("club_id", clubId)
          .single();
        if (cancelled) return;
        if (qErr) throw qErr;
        const r = row as Payment & { member?: ReceiptMember | null };
        const main: Line = { payment: r, member: r.member ?? null };
        setPrimary(main);

        const isFamily =
          !!r.batch_id && !!r.member?.family_id;

        if (isFamily && r.batch_id) {
          const { data: rows, error: bErr } = await supabase
            .from("payments")
            .select(
              "*, member:members!member_id(id,first_name,last_name,email,phone,family_id,family_role,birth_date)"
            )
            .eq("club_id", clubId)
            .eq("batch_id", r.batch_id);
          if (cancelled) return;
          if (bErr) throw bErr;
          const lines: Line[] = (rows ?? []).map((x) => {
            const px = x as Payment & { member?: ReceiptMember | null };
            return { payment: px, member: px.member ?? null };
          });
          setBatchLines(lines);
        } else {
          setBatchLines([main]);
        }
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
  }, [paymentId, clubId, clubLoading]);

  const isFamilyReceipt = useMemo(() => {
    if (!primary?.payment.batch_id) return false;
    if (!primary.member?.family_id) return false;
    return batchLines.length > 1;
  }, [primary, batchLines]);

  const familyName = useMemo(() => {
    if (!isFamilyReceipt) return null;
    const parents = batchLines.filter(
      (l) => l.member?.family_role === "parent"
    );
    const candidate =
      parents.length > 0
        ? parents
            .map((l) => l.member!)
            .sort((a, b) => {
              const aa = calculateAge(a.birth_date) ?? -1;
              const bb = calculateAge(b.birth_date) ?? -1;
              return bb - aa;
            })[0]
        : pickEldest(batchLines);
    return candidate?.last_name?.toUpperCase() ?? null;
  }, [isFamilyReceipt, batchLines]);

  const payerMember = useMemo<ReceiptMember | null>(() => {
    if (!isFamilyReceipt) return primary?.member ?? null;
    const candidates = batchLines
      .map((l) => l.member)
      .filter((m): m is ReceiptMember => !!m);
    if (candidates.length === 0) return null;

    const roleScore = (r: FamilyRole | null | undefined): number => {
      if (r === "parent") return 0;
      if (r === "spouse") return 1;
      if (r === "other") return 2;
      if (r == null) return 3;
      return 4; // child last
    };

    const sorted = [...candidates].sort((a, b) => {
      const dr = roleScore(a.family_role) - roleScore(b.family_role);
      if (dr !== 0) return dr;
      const ageA = calculateAge(a.birth_date) ?? -1;
      const ageB = calculateAge(b.birth_date) ?? -1;
      const adultA = ageA >= 18 ? 1 : 0;
      const adultB = ageB >= 18 ? 1 : 0;
      if (adultA !== adultB) return adultB - adultA;
      return ageB - ageA;
    });

    return sorted[0];
  }, [isFamilyReceipt, batchLines, primary]);

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl p-10 text-center text-muted">
        Φόρτωση…
      </div>
    );
  }

  if (error || !primary) {
    return (
      <div className="mx-auto max-w-2xl p-10 text-center text-danger">
        {error ?? "Δεν βρέθηκε η απόδειξη."}
      </div>
    );
  }

  const { payment } = primary;
  const receiptNo = payment.id.slice(0, 8).toUpperCase();
  const periodLabel = payment.period
    ? payment.type === "annual"
      ? `Έτος ${payment.period}`
      : payment.period
    : "—";
  const totalAmount = batchLines.reduce(
    (s, l) => s + Number(l.payment.amount ?? 0),
    0
  );

  return (
    <div className="mx-auto max-w-3xl p-6 print:p-0">
      <div className="sticky top-0 z-10 mb-4 flex justify-end gap-2 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90"
        >
          🖨 Εκτύπωση / Αποθήκευση ως PDF
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

        {isFamilyReceipt ? (
          <>
            <section className="mb-8">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                Στοιχεία
              </h2>
              {familyName && (
                <p className="text-lg">
                  <span className="text-muted">Οικογένεια: </span>
                  <span className="font-semibold uppercase">
                    {familyName}
                  </span>
                </p>
              )}
              {payerMember && (
                <p className="mt-1 text-sm">
                  <span className="text-muted">Πληρωτής: </span>
                  <span className="font-medium uppercase">
                    {payerMember.last_name} {payerMember.first_name}
                  </span>
                  {payerMember.family_role === "parent" && (
                    <span className="ml-2 text-xs text-muted">
                      (ως γονέας/εκπρόσωπος)
                    </span>
                  )}
                </p>
              )}
              {payerMember?.email && (
                <p className="text-xs text-muted">{payerMember.email}</p>
              )}
              {payerMember?.phone && (
                <p className="text-xs text-muted">{payerMember.phone}</p>
              )}
            </section>

            <section className="mb-8 break-inside-avoid">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                Ανάλυση
              </h2>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-border">
                  {sortLines(batchLines).map((l) => (
                    <tr key={l.payment.id}>
                      <td className="py-2 font-medium">
                        {l.member?.first_name ?? "—"}
                      </td>
                      <td className="py-2 text-muted">
                        {PAYMENT_TYPE_LABEL[l.payment.type]}
                      </td>
                      <td className="py-2 text-right font-medium">
                        {eur.format(Number(l.payment.amount))}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td
                      colSpan={2}
                      className="py-3 text-base font-semibold"
                    >
                      Σύνολο
                    </td>
                    <td className="py-3 text-right text-lg font-semibold">
                      {eur.format(totalAmount)}
                    </td>
                  </tr>
                </tbody>
              </table>
              {payment.period && (
                <p className="mt-2 text-xs text-muted">
                  Περίοδος: {periodLabel}
                </p>
              )}
            </section>
          </>
        ) : (
          <>
            <section className="mb-8">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                Στοιχεία Μέλους
              </h2>
              <p className="text-lg font-medium">
                {primary.member
                  ? `${primary.member.last_name} ${primary.member.first_name}`.trim()
                  : "—"}
              </p>
              {primary.member?.email && (
                <p className="text-sm text-muted">{primary.member.email}</p>
              )}
              {primary.member?.phone && (
                <p className="text-sm text-muted">{primary.member.phone}</p>
              )}
            </section>

            <section className="mb-8 break-inside-avoid">
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
                    <td className="py-2 text-right font-medium">
                      {periodLabel}
                    </td>
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
          </>
        )}

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
          @page {
            size: A4 portrait;
            margin: 1cm;
          }
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
          section,
          table {
            page-break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
}

function pickEldest(lines: Line[]): ReceiptMember | null {
  let eldest: ReceiptMember | null = null;
  let eldestAge = -1;
  for (const l of lines) {
    const m = l.member;
    if (!m) continue;
    const a = calculateAge(m.birth_date) ?? -1;
    if (a > eldestAge) {
      eldestAge = a;
      eldest = m;
    }
  }
  return eldest;
}

function sortLines(lines: Line[]): Line[] {
  const rank = (r: FamilyRole | null | undefined): number => {
    if (r === "parent") return 0;
    if (r === "spouse") return 1;
    if (r === "child") return 2;
    return 3;
  };
  return [...lines].sort((a, b) => {
    const dr = rank(a.member?.family_role) - rank(b.member?.family_role);
    if (dr !== 0) return dr;
    if (
      a.member?.family_role === "child" &&
      b.member?.family_role === "child"
    ) {
      const aa = calculateAge(a.member.birth_date) ?? 0;
      const bb = calculateAge(b.member.birth_date) ?? 0;
      return aa - bb;
    }
    const an = `${a.member?.last_name ?? ""} ${a.member?.first_name ?? ""}`;
    const bn = `${b.member?.last_name ?? ""} ${b.member?.first_name ?? ""}`;
    return an.localeCompare(bn, "el");
  });
}
