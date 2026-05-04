"use client";

import {
  Fragment,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { errorMessage, getBrowserClient } from "@/lib/supabase/client";
import { useRole } from "@/lib/hooks/useRole";
import { useCurrentClub } from "@/lib/hooks/useCurrentClub";
import { AccessDenied } from "@/lib/auth/AccessDenied";
import type {
  ApprovalStatus,
  DiscountRule,
  Event as EventRow,
  Member,
  Payment,
  PaymentInsert,
  PaymentTemplate,
  PaymentTemplateInsert,
  PaymentTemplateUpdate,
  PaymentType,
  Reservation,
} from "@/lib/supabase/types";
import { calculateDiscount, generateUuid } from "@/lib/utils/discounts";
import { formatMemberName } from "@/lib/utils/attendees";
import SponsorsTab from "./SponsorsTab";

type Tab = "payments" | "dashboard" | "sponsors";

function resolveTab(raw: string | null): Tab {
  if (raw === "reservations") return "dashboard"; // backwards compat for old bookmarks
  if (raw === "dashboard") return "dashboard";
  if (raw === "sponsors") return "sponsors";
  return "payments";
}

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

const PAYMENT_TYPE_LABEL: Record<PaymentType, string> = {
  monthly_fee: "Μηνιαία Συνδρομή",
  annual: "Ετήσια Συνδρομή",
};

const eur = new Intl.NumberFormat("el-GR", {
  style: "currency",
  currency: "EUR",
});


function currentMonthPeriod(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function currentYearPeriod(): string {
  return String(new Date().getFullYear());
}

function FinancesContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab = resolveTab(searchParams.get("tab"));
  const role = useRole();

  function handleTabChange(next: Tab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    router.replace(`/finances?${params.toString()}`, { scroll: false });
  }

  if (role.loading) {
    return (
      <div className="mx-auto w-full max-w-6xl p-10 text-center text-muted">
        Φόρτωση…
      </div>
    );
  }

  if (!role.userId) {
    return (
      <div className="mx-auto w-full max-w-2xl">
        <div className="rounded-xl border border-border bg-surface p-6 text-sm">
          <h1 className="text-lg font-semibold">Παρακαλώ συνδεθείτε</h1>
          <p className="mt-2 text-muted">
            Η ενότητα «Οικονομικά» απαιτεί σύνδεση. Συνδεθείτε με τον
            λογαριασμό σας για να συνεχίσετε.
          </p>
          <Link
            href="/login?redirect=/finances"
            className="mt-4 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90"
          >
            Σύνδεση
          </Link>
        </div>
      </div>
    );
  }

  if (!role.permissions.includes("finances")) {
    return <AccessDenied />;
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <header className="mb-3">
        <h1 className="text-xl font-semibold tracking-tight">
          Οικονομική Διαχείριση
        </h1>
      </header>

      <div className="mb-6 inline-flex rounded-lg border border-border bg-surface p-1 text-sm">
        <TabButton current={tab} value="payments" onSelect={handleTabChange}>
          Πληρωμές Μελών
        </TabButton>
        <TabButton current={tab} value="dashboard" onSelect={handleTabChange}>
          Κρατήσεις Εκδηλώσεων
        </TabButton>
        <TabButton current={tab} value="sponsors" onSelect={handleTabChange}>
          Χορηγοί
        </TabButton>
      </div>

      {tab === "payments" ? (
        <PaymentsTab />
      ) : tab === "dashboard" ? (
        <ReservationsTab />
      ) : (
        <SponsorsTab />
      )}
    </div>
  );
}

export default function FinancesPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-6xl p-10 text-center text-muted">
          Φόρτωση…
        </div>
      }
    >
      <FinancesContent />
    </Suspense>
  );
}

function ApprovalBadge({
  status,
  reason,
}: {
  status: ApprovalStatus;
  reason: string | null;
}) {
  if (status === "not_required") return null;
  const cfg =
    status === "pending"
      ? {
          cls: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
          label: "🟡 Εκκρεμεί",
        }
      : status === "approved"
        ? {
            cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
            label: "🟢 Εγκρίθηκε",
          }
        : {
            cls: "bg-red-500/10 text-red-700 dark:text-red-300",
            label: "🔴 Απορρίφθηκε",
          };
  return (
    <span
      title={reason ?? undefined}
      className={
        "inline-block rounded-full px-2 py-0.5 text-[10px] font-medium " +
        cfg.cls
      }
    >
      {cfg.label}
    </span>
  );
}

function PaymentTypeBadge({ type }: { type: PaymentType }) {
  const cls =
    type === "monthly_fee"
      ? "bg-blue-500/10 text-blue-700 dark:text-blue-300"
      : "bg-purple-500/10 text-purple-700 dark:text-purple-300";
  return (
    <span
      className={
        "inline-block rounded-full px-2 py-0.5 text-[10px] font-medium " + cls
      }
    >
      {PAYMENT_TYPE_LABEL[type]}
    </span>
  );
}

function TabButton({
  current,
  value,
  onSelect,
  children,
}: {
  current: Tab;
  value: Tab;
  onSelect: (v: Tab) => void;
  children: ReactNode;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={
        "rounded-md px-4 py-1.5 transition " +
        (active
          ? "bg-accent text-white shadow-sm"
          : "text-foreground/80 hover:bg-foreground/5")
      }
    >
      {children}
    </button>
  );
}

// ────────────────────────────────────────────────────────────
// Tab 1 — Πληρωμές Μελών
// ────────────────────────────────────────────────────────────

type PaymentRow = Payment & {
  member_first_name: string | null;
  member_last_name: string | null;
};

type PaymentForm = {
  member_id: string;
  amount: string;
  type: PaymentType;
  period: string;
  payment_date: string;
  template_id: string;
};

function emptyPaymentForm(): PaymentForm {
  return {
    member_id: "",
    amount: "",
    type: "monthly_fee",
    period: currentMonthPeriod(),
    payment_date: new Date().toISOString().slice(0, 10),
    template_id: "",
  };
}

type TemplateForm = {
  label: string;
  amount: string;
  payment_type: PaymentType;
};

const emptyTemplateForm: TemplateForm = {
  label: "",
  amount: "",
  payment_type: "monthly_fee",
};

type BulkForm = {
  template_id: string;
  type: PaymentType;
  amount: string;
  period: string;
  payment_date: string;
  selected: Set<string>;
};

type BulkPreviewRow = {
  member_id: string;
  member_name: string;
  rule_label: string | null;
  original_amount: number;
  discount_percent: number;
  computed_amount: number;
  final_amount: string;
  override_reason: string;
};

const emptyBulkForm: BulkForm = {
  template_id: "",
  type: "monthly_fee",
  amount: "",
  period: currentMonthPeriod(),
  payment_date: new Date().toISOString().slice(0, 10),
  selected: new Set<string>(),
};

function PaymentsTab() {
  const role = useRole();
  const { clubId, loading: clubLoading } = useCurrentClub();
  const [members, setMembers] = useState<Member[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [templates, setTemplates] = useState<PaymentTemplate[]>([]);
  const [discountRules, setDiscountRules] = useState<DiscountRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [memberFilter, setMemberFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<"all" | PaymentType>("all");
  const [periodFilter, setPeriodFilter] = useState<string>("");

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<PaymentForm>(emptyPaymentForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [batchDelete, setBatchDelete] = useState<{
    batchId: string;
    rows: PaymentRow[];
    hadApproved: boolean;
  } | null>(null);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");

  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<PaymentTemplate | null>(
    null
  );
  const [templateForm, setTemplateForm] = useState<TemplateForm>(
    emptyTemplateForm
  );
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkForm, setBulkForm] = useState<BulkForm>(emptyBulkForm);
  const [bulkStep, setBulkStep] = useState<"config" | "preview">("config");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkPreview, setBulkPreview] = useState<BulkPreviewRow[]>([]);

  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const load = useCallback(async () => {
    if (!clubId) return;
    try {
      const supabase = getBrowserClient();
      const [mRes, pRes, tRes, dRes] = await Promise.all([
        supabase
          .from("members")
          .select("*")
          .eq("club_id", clubId)
          .order("last_name", { ascending: true })
          .order("first_name", { ascending: true }),
        supabase
          .from("payments")
          .select("*, member:members!member_id(first_name,last_name)")
          .eq("club_id", clubId)
          .order("payment_date", { ascending: false }),
        supabase
          .from("payment_templates")
          .select("*")
          .eq("club_id", clubId)
          .order("label", { ascending: true }),
        supabase
          .from("discount_rules")
          .select("*")
          .eq("club_id", clubId),
      ]);
      if (mRes.error) throw mRes.error;
      if (pRes.error) throw pRes.error;
      if (tRes.error) throw tRes.error;
      if (dRes.error) throw dRes.error;
      setTemplates(tRes.data ?? []);
      setDiscountRules((dRes.data ?? []) as DiscountRule[]);

      const rows = (pRes.data ?? []).map((row) => {
        const r = row as Payment & {
          member?: { first_name: string; last_name: string } | null;
        };
        return {
          id: r.id,
          club_id: r.club_id,
          member_id: r.member_id,
          amount: r.amount,
          payment_date: r.payment_date,
          type: r.type,
          period: r.period,
          original_amount: r.original_amount,
          override_reason: r.override_reason,
          approval_status: r.approval_status,
          approved_by: r.approved_by,
          approved_at: r.approved_at,
          batch_id: r.batch_id,
          created_at: r.created_at,
          member_first_name: r.member?.first_name ?? null,
          member_last_name: r.member?.last_name ?? null,
        } satisfies PaymentRow;
      });

      setError(null);
      setMembers(mRes.data ?? []);
      setPayments(rows);
    } catch (err) {
      setError(errorMessage(err, "Σφάλμα φόρτωσης πληρωμών."));
    } finally {
      setLoading(false);
    }
  }, [clubId]);

  useEffect(() => {
    if (clubLoading) return;
    load();
  }, [load, clubLoading]);

  const filtered = useMemo(() => {
    return payments.filter((p) => {
      if (memberFilter && p.member_id !== memberFilter) return false;
      if (typeFilter !== "all" && p.type !== typeFilter) return false;
      if (periodFilter && (p.period ?? "") !== periodFilter) return false;
      return true;
    });
  }, [payments, memberFilter, typeFilter, periodFilter]);

  const totalAmount = useMemo(
    () => filtered.reduce((s, p) => s + Number(p.amount ?? 0), 0),
    [filtered]
  );

  const batchCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of payments) {
      if (!p.batch_id) continue;
      m.set(p.batch_id, (m.get(p.batch_id) ?? 0) + 1);
    }
    return m;
  }, [payments]);

  const batchPositions = useMemo(() => {
    const seen = new Map<string, number>();
    const m = new Map<string, number>();
    const sorted = [...payments].sort((a, b) => {
      const dateA = a.payment_date ?? "";
      const dateB = b.payment_date ?? "";
      if (dateA !== dateB) return dateA.localeCompare(dateB);

      const createdA = a.created_at ?? "";
      const createdB = b.created_at ?? "";
      return createdA.localeCompare(createdB);
    });
    for (const p of sorted) {
      if (!p.batch_id) continue;
      const pos = (seen.get(p.batch_id) ?? 0) + 1;
      seen.set(p.batch_id, pos);
      m.set(p.id, pos);
    }
    return m;
  }, [payments]);

  const periodOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of payments) if (p.period) set.add(p.period);
    return Array.from(set).sort().reverse();
  }, [payments]);

  function openCreate() {
    setForm(emptyPaymentForm());
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setModalOpen(false);
    setFormError(null);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);

    const member_id = form.member_id;
    const amount = Number(form.amount.replace(",", "."));
    if (!member_id) {
      setFormError("Επιλέξτε μέλος.");
      return;
    }
    if (!Number.isFinite(amount) || amount < 0) {
      setFormError("Το ποσό πρέπει να είναι μη αρνητικός αριθμός.");
      return;
    }
    if (!form.payment_date) {
      setFormError("Η ημερομηνία είναι υποχρεωτική.");
      return;
    }

    if (!clubId) {
      setFormError("Δεν έχει εντοπιστεί σύλλογος.");
      return;
    }

    const insert: PaymentInsert = {
      club_id: clubId,
      member_id,
      amount,
      type: form.type,
      period: form.period.trim() || null,
      payment_date: form.payment_date,
    };

    setSaving(true);
    try {
      const supabase = getBrowserClient();
      const { error: iErr } = await supabase.from("payments").insert(insert);
      if (iErr) throw iErr;
      setModalOpen(false);
      await load();
    } catch (err) {
      setFormError(errorMessage(err, "Σφάλμα αποθήκευσης πληρωμής."));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(p: PaymentRow) {
    if (!clubId) return;
    if (p.batch_id) {
      const rows = payments.filter((x) => x.batch_id === p.batch_id);
      if (rows.length > 1) {
        const hadApproved = rows.some(
          (r) => r.approval_status === "approved"
        );
        setOverrideReason("");
        setBatchDelete({
          batchId: p.batch_id,
          rows,
          hadApproved,
        });
        return;
      }
    }
    const ok = window.confirm(
      "Διαγραφή πληρωμής; Η ενέργεια δεν αναιρείται."
    );
    if (!ok) return;
    try {
      const supabase = getBrowserClient();
      const { error: dErr } = await supabase
        .from("payments")
        .delete()
        .eq("id", p.id)
        .eq("club_id", clubId);
      if (dErr) throw dErr;
      await load();
    } catch (err) {
      setError(errorMessage(err, "Σφάλμα διαγραφής πληρωμής."));
    }
  }

  async function confirmBatchDelete() {
    if (!batchDelete || !clubId) return;
    const { batchId, rows, hadApproved } = batchDelete;
    if (hadApproved && !role.isSystemAdmin) return;
    if (!role.memberId) {
      setError(
        "Δεν είναι δυνατή η διαγραφή — απαιτείται ταυτοποίηση χρήστη. Παρακαλώ ξανασυνδεθείτε."
      );
      return;
    }
    let reason: string | null = null;
    if (hadApproved) {
      reason = overrideReason.trim();
      if (reason.length < 10) return;
    }
    setBatchDeleting(true);
    try {
      const supabase = getBrowserClient();
      const totalAmount = rows.reduce(
        (s, r) => s + Number(r.amount ?? 0),
        0
      );
      const snapshot = rows.map((r) => ({
        id: r.id,
        member_id: r.member_id,
        member_first_name: r.member_first_name,
        member_last_name: r.member_last_name,
        amount: Number(r.amount),
        payment_date: r.payment_date,
        type: r.type,
        period: r.period,
        original_amount: r.original_amount,
        override_reason: r.override_reason,
        approval_status: r.approval_status,
        approved_by: r.approved_by,
        approved_at: r.approved_at,
        batch_id: r.batch_id,
        created_at: r.created_at,
      }));
      const { error: auditErr } = await supabase
        .from("payment_deletion_audit")
        .insert({
          club_id: clubId,
          batch_id: batchId,
          deleted_by: role.memberId,
          override_reason: reason,
          payment_count: rows.length,
          total_amount: totalAmount,
          payments_snapshot: snapshot,
          had_approved_payments: hadApproved,
        });
      if (auditErr) {
        setError(
          errorMessage(auditErr, "Σφάλμα audit log — η διαγραφή ακυρώθηκε.")
        );
        return;
      }
      const { error: dErr } = await supabase
        .from("payments")
        .delete()
        .eq("batch_id", batchId)
        .eq("club_id", clubId);
      if (dErr) throw dErr;
      const n = rows.length;
      setBatchDelete(null);
      setOverrideReason("");
      await load();
      setError(null);
      setNotice(
        hadApproved
          ? `Διαγράφηκαν ${n} πληρωμές της οικογένειας με override.`
          : `Διαγράφηκαν ${n} πληρωμές της οικογένειας.`
      );
    } catch (err) {
      setError(errorMessage(err, "Σφάλμα διαγραφής πληρωμών οικογένειας."));
    } finally {
      setBatchDeleting(false);
    }
  }

  function openCreateTemplate() {
    setEditingTemplate(null);
    setTemplateForm(emptyTemplateForm);
    setTemplateError(null);
    setTemplateModalOpen(true);
  }
  function openEditTemplate(t: PaymentTemplate) {
    setEditingTemplate(t);
    setTemplateForm({
      label: t.label,
      amount: String(t.amount),
      payment_type: t.payment_type,
    });
    setTemplateError(null);
    setTemplateModalOpen(true);
  }
  function closeTemplateModal() {
    if (templateSaving) return;
    setTemplateModalOpen(false);
    setEditingTemplate(null);
    setTemplateError(null);
  }
  async function handleTemplateSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTemplateError(null);
    const label = templateForm.label.trim();
    const amount = Number(templateForm.amount.replace(",", "."));
    if (!label) {
      setTemplateError("Το όνομα προτύπου είναι υποχρεωτικό.");
      return;
    }
    if (!Number.isFinite(amount) || amount < 0) {
      setTemplateError("Το ποσό πρέπει να είναι μη αρνητικός αριθμός.");
      return;
    }
    if (!clubId) {
      setTemplateError("Δεν έχει εντοπιστεί σύλλογος.");
      return;
    }
    setTemplateSaving(true);
    try {
      const supabase = getBrowserClient();
      if (editingTemplate) {
        const update: PaymentTemplateUpdate = {
          label,
          amount,
          payment_type: templateForm.payment_type,
        };
        const { error: uErr } = await supabase
          .from("payment_templates")
          .update(update)
          .eq("id", editingTemplate.id)
          .eq("club_id", clubId);
        if (uErr) throw uErr;
      } else {
        const insert: PaymentTemplateInsert = {
          club_id: clubId,
          label,
          amount,
          payment_type: templateForm.payment_type,
        };
        const { error: iErr } = await supabase
          .from("payment_templates")
          .insert(insert);
        if (iErr) throw iErr;
      }
      setTemplateModalOpen(false);
      setEditingTemplate(null);
      await load();
    } catch (err) {
      setTemplateError(errorMessage(err, "Σφάλμα αποθήκευσης προτύπου."));
    } finally {
      setTemplateSaving(false);
    }
  }
  async function handleTemplateDelete(t: PaymentTemplate) {
    if (!window.confirm(`Διαγραφή προτύπου «${t.label}»;`)) return;
    if (!clubId) return;
    try {
      const supabase = getBrowserClient();
      const { error: dErr } = await supabase
        .from("payment_templates")
        .delete()
        .eq("id", t.id)
        .eq("club_id", clubId);
      if (dErr) throw dErr;
      await load();
    } catch (err) {
      setError(errorMessage(err, "Σφάλμα διαγραφής προτύπου."));
    }
  }

  function openBulk() {
    setBulkForm({ ...emptyBulkForm, selected: new Set<string>() });
    setBulkStep("config");
    setBulkPreview([]);
    setBulkError(null);
    setBulkOpen(true);
  }
  function closeBulk() {
    if (bulkSaving) return;
    setBulkOpen(false);
    setBulkError(null);
  }

  function buildPreview(): BulkPreviewRow[] {
    const ids = Array.from(bulkForm.selected);
    const amount = Number(bulkForm.amount.replace(",", "."));
    if (!Number.isFinite(amount) || amount < 0) return [];
    return ids
      .map((id) => {
        const member = members.find((m) => m.id === id);
        if (!member) return null;
        const family = member.family_id
          ? members.filter((m) => m.family_id === member.family_id)
          : [];
        const result = calculateDiscount({
          member,
          family,
          baseAmount: amount,
          context: "subscription",
          rules: discountRules,
        });
        return {
          member_id: id,
          member_name: `${member.last_name} ${member.first_name}`.trim(),
          rule_label: result.ruleLabel,
          original_amount: result.originalAmount,
          discount_percent: result.discountPercent,
          computed_amount: result.finalAmount,
          final_amount: String(result.finalAmount),
          override_reason: "",
        } satisfies BulkPreviewRow;
      })
      .filter((x): x is BulkPreviewRow => !!x)
      .sort((a, b) => a.member_name.localeCompare(b.member_name, "el", { sensitivity: "base" }));
  }

  function goToPreview() {
    setBulkError(null);
    if (bulkForm.selected.size === 0) {
      setBulkError("Επιλέξτε τουλάχιστον ένα μέλος.");
      return;
    }
    const amount = Number(bulkForm.amount.replace(",", "."));
    if (!Number.isFinite(amount) || amount < 0) {
      setBulkError("Το ποσό πρέπει να είναι μη αρνητικός αριθμός.");
      return;
    }
    if (!bulkForm.period.trim()) {
      setBulkError("Η περίοδος είναι υποχρεωτική.");
      return;
    }
    setBulkPreview(buildPreview());
    setBulkStep("preview");
  }

  async function handleBulkSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBulkError(null);
    if (!clubId) {
      setBulkError("Δεν έχει εντοπιστεί σύλλογος.");
      return;
    }
    if (!role.memberId) {
      setBulkError("Δεν έχει εντοπιστεί χρήστης.");
      return;
    }
    // Validate overrides have reasons
    for (const row of bulkPreview) {
      const finalNum = Number(row.final_amount.replace(",", "."));
      if (!Number.isFinite(finalNum) || finalNum < 0) {
        setBulkError(`Άκυρο ποσό για ${row.member_name}.`);
        return;
      }
      if (
        Math.abs(finalNum - row.computed_amount) > 0.005 &&
        !row.override_reason.trim()
      ) {
        setBulkError(
          `Συμπληρώστε λόγο αλλαγής για ${row.member_name}.`
        );
        return;
      }
    }

    setBulkSaving(true);
    try {
      const supabase = getBrowserClient();
      const period = bulkForm.period.trim() || null;
      const ids = bulkPreview.map((p) => p.member_id);

      // Find duplicates
      let existingIds = new Set<string>();
      if (period) {
        const { data: existing, error: eErr } = await supabase
          .from("payments")
          .select("member_id")
          .eq("club_id", clubId)
          .eq("type", bulkForm.type)
          .eq("period", period)
          .in("member_id", ids);
        if (eErr) throw eErr;
        existingIds = new Set((existing ?? []).map((r) => r.member_id));
      }

      const isPrivileged = role.isSystemAdmin || role.isPresident;
      const inserts: PaymentInsert[] = [];
      let pendingCount = 0;

      const batchByFamily = new Map<string, string>();

      for (const row of bulkPreview) {
        if (existingIds.has(row.member_id)) continue;
        const finalAmount = Number(row.final_amount.replace(",", "."));
        const isOverride =
          Math.abs(finalAmount - row.computed_amount) > 0.005;
        const approvalStatus = !isOverride
          ? "not_required"
          : isPrivileged
            ? "approved"
            : "pending";
        if (approvalStatus === "pending") pendingCount++;

        const member = members.find((m) => m.id === row.member_id);
        let batchId: string;
        if (member?.family_id) {
          const existing = batchByFamily.get(member.family_id);
          if (existing) {
            batchId = existing;
          } else {
            batchId = generateUuid();
            batchByFamily.set(member.family_id, batchId);
          }
        } else {
          batchId = generateUuid();
        }

        inserts.push({
          club_id: clubId,
          member_id: row.member_id,
          amount: finalAmount,
          original_amount: row.original_amount,
          override_reason: isOverride ? row.override_reason.trim() : null,
          approval_status: approvalStatus,
          approved_by:
            !isOverride || isPrivileged ? role.memberId : null,
          approved_at:
            !isOverride || isPrivileged ? new Date().toISOString() : null,
          type: bulkForm.type,
          period,
          payment_date: bulkForm.payment_date,
          batch_id: batchId,
        });
      }

      const skipped = bulkPreview.length - inserts.length;

      if (inserts.length > 0) {
        const { error: iErr } = await supabase
          .from("payments")
          .insert(inserts);
        if (iErr) throw iErr;
      }

      setBulkOpen(false);
      setToast(
        `Δημιουργήθηκαν ${inserts.length} πληρωμές. Παραλείφθηκαν ${skipped} (διπλότυπες). ${pendingCount} χρειάζονται έγκριση.`
      );
      await load();
    } catch (err) {
      setBulkError(errorMessage(err, "Σφάλμα μαζικής χρέωσης."));
    } finally {
      setBulkSaving(false);
    }
  }

  function updatePreviewRow(
    member_id: string,
    patch: Partial<BulkPreviewRow>
  ) {
    setBulkPreview((rows) =>
      rows.map((r) => (r.member_id === member_id ? { ...r, ...patch } : r))
    );
  }

  const activeMembers = useMemo(
    () => members.filter((m) => m.status === "active"),
    [members]
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Μέλος">
            <select
              value={memberFilter}
              onChange={(e) => setMemberFilter(e.target.value)}
              className={inputClass}
            >
              <option value="">— Όλα —</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {formatMemberName(m)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Τύπος">
            <select
              value={typeFilter}
              onChange={(e) =>
                setTypeFilter(e.target.value as "all" | PaymentType)
              }
              className={inputClass}
            >
              <option value="all">Όλοι</option>
              <option value="monthly_fee">{PAYMENT_TYPE_LABEL.monthly_fee}</option>
              <option value="annual">{PAYMENT_TYPE_LABEL.annual}</option>
            </select>
          </Field>
          <Field label="Περίοδος">
            <select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value)}
              className={inputClass}
            >
              <option value="">— Όλες —</option>
              {periodOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={openBulk}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium transition hover:bg-foreground/5"
          >
            Μαζική Χρέωση
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90"
          >
            + Νέα Πληρωμή
          </button>
        </div>
      </div>

      <TemplatesCard
        templates={templates}
        onCreate={openCreateTemplate}
        onEdit={openEditTemplate}
        onDelete={handleTemplateDelete}
      />

      {toast && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
          <span>{toast}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="shrink-0 rounded px-2 text-xs hover:opacity-70"
            aria-label="Κλείσιμο"
          >
            ✕
          </button>
        </div>
      )}

      {error && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="shrink-0 rounded px-2 text-xs hover:opacity-70"
            aria-label="Κλείσιμο"
          >
            ✕
          </button>
        </div>
      )}

      {notice && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="shrink-0 rounded px-2 text-xs hover:opacity-70"
            aria-label="Κλείσιμο"
          >
            ✕
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-background/50 text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-3">Ημερομηνία</th>
                <th className="px-4 py-3">Μέλος</th>
                <th className="px-4 py-3">Τύπος</th>
                <th className="px-4 py-3">Περίοδος</th>
                <th className="px-4 py-3 text-right">Ποσό</th>
                <th className="px-4 py-3">Έγκριση</th>
                <th className="px-4 py-3 text-right">Ενέργειες</th>
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
                    {payments.length === 0
                      ? "Δεν υπάρχουν ακόμη πληρωμές."
                      : "Δεν βρέθηκαν πληρωμές για τα φίλτρα."}
                  </td>
                </tr>
              ) : (
                filtered.map((p) => {
                  const name =
                    p.member_last_name || p.member_first_name
                      ? `${p.member_last_name ?? ""} ${p.member_first_name ?? ""}`.trim()
                      : "—";
                  const batchSize = p.batch_id
                    ? batchCounts.get(p.batch_id) ?? 1
                    : 1;
                  const batchPos = p.batch_id
                    ? batchPositions.get(p.id) ?? 1
                    : 0;
                  const inBatch = batchSize > 1;
                  return (
                    <tr key={p.id} className="hover:bg-background/40">
                      <td
                        className={
                          "px-4 py-3 text-muted" +
                          (inBatch
                            ? " border-l-[3px] border-l-[#800000]"
                            : "")
                        }
                      >
                        {new Date(p.payment_date).toLocaleDateString("el-GR")}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {name}
                        {inBatch && (
                          <div className="text-xs text-gray-500">
                            Οικογένεια {batchPos}/{batchSize}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {PAYMENT_TYPE_LABEL[p.type]}
                      </td>
                      <td className="px-4 py-3 text-muted">{p.period ?? "—"}</td>
                      <td className="px-4 py-3 text-right font-medium">
                        {eur.format(Number(p.amount))}
                      </td>
                      <td className="px-4 py-3">
                        <ApprovalBadge
                          status={p.approval_status}
                          reason={p.override_reason}
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex justify-end gap-2">
                          <a
                            href={`/finances/receipt/${p.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={
                              inBatch
                                ? `Οικογενειακή απόδειξη (${batchSize} μέλη)`
                                : undefined
                            }
                            className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1 text-xs transition hover:bg-background"
                          >
                            Απόδειξη
                            {inBatch && <span aria-hidden>👪</span>}
                          </a>
                          <button
                            type="button"
                            onClick={() => handleDelete(p)}
                            className="rounded-md border border-danger/30 px-3 py-1 text-xs text-danger transition hover:bg-danger/10"
                          >
                            Διαγραφή
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {!loading && filtered.length > 0 && (
              <tfoot className="border-t border-border bg-background/30 text-sm font-medium">
                <tr>
                  <td colSpan={4} className="px-4 py-3 text-right text-muted">
                    Σύνολο ({filtered.length} εγγραφές):
                  </td>
                  <td className="px-4 py-3 text-right">
                    {eur.format(totalAmount)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {modalOpen && (
        <PaymentModal
          members={members}
          templates={templates}
          form={form}
          setForm={setForm}
          saving={saving}
          formError={formError}
          onClose={closeModal}
          onSubmit={handleSubmit}
        />
      )}

      {batchDelete && (
        <BatchDeleteModal
          rows={batchDelete.rows}
          hadApproved={batchDelete.hadApproved}
          isSystemAdmin={role.isSystemAdmin}
          deleting={batchDeleting}
          overrideReason={overrideReason}
          setOverrideReason={setOverrideReason}
          onCancel={() => {
            if (!batchDeleting) {
              setBatchDelete(null);
              setOverrideReason("");
            }
          }}
          onConfirm={confirmBatchDelete}
        />
      )}

      {templateModalOpen && (
        <TemplateModal
          editing={editingTemplate}
          form={templateForm}
          setForm={setTemplateForm}
          saving={templateSaving}
          formError={templateError}
          onClose={closeTemplateModal}
          onSubmit={handleTemplateSubmit}
        />
      )}

      {bulkOpen && (
        <BulkChargeModal
          members={activeMembers}
          templates={templates}
          form={bulkForm}
          setForm={setBulkForm}
          step={bulkStep}
          preview={bulkPreview}
          updatePreviewRow={updatePreviewRow}
          onNext={goToPreview}
          onBack={() => setBulkStep("config")}
          isPrivileged={role.isSystemAdmin || role.isPresident}
          saving={bulkSaving}
          formError={bulkError}
          onClose={closeBulk}
          onSubmit={handleBulkSubmit}
        />
      )}
    </div>
  );
}

function TemplatesCard({
  templates,
  onCreate,
  onEdit,
  onDelete,
}: {
  templates: PaymentTemplate[];
  onCreate: () => void;
  onEdit: (t: PaymentTemplate) => void;
  onDelete: (t: PaymentTemplate) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="mb-4 rounded-xl border border-border bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-2 p-4">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex flex-1 items-center gap-2 text-left"
        >
          <span
            aria-hidden="true"
            className={
              "inline-block w-3 text-xs text-muted transition-transform " +
              (open ? "rotate-90" : "")
            }
          >
            ▶
          </span>
          <span>
            <span className="text-sm font-semibold">Πρότυπα Πληρωμών</span>
            <span className="ml-2 text-xs text-muted">
              ({templates.length})
            </span>
            <span className="block text-xs text-muted">
              Συντομεύσεις για τις πιο συχνές κατηγορίες πληρωμών.
            </span>
          </span>
        </button>
        {open && (
          <button
            type="button"
            onClick={onCreate}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition hover:bg-foreground/5"
          >
            + Νέο Πρότυπο
          </button>
        )}
      </header>

      {open &&
        (templates.length === 0 ? (
          <p className="px-4 pb-4 text-xs text-muted">Δεν υπάρχουν πρότυπα.</p>
        ) : (
          <ul className="grid gap-2 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{t.label}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted">
                    {eur.format(Number(t.amount))}
                  </span>
                  <PaymentTypeBadge type={t.payment_type} />
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => onEdit(t)}
                  className="rounded-md border border-border px-2 py-1 text-[11px] transition hover:bg-foreground/5"
                >
                  Επεξ.
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(t)}
                  className="rounded-md border border-danger/30 px-2 py-1 text-[11px] text-danger transition hover:bg-danger/10"
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
          </ul>
        ))}
    </section>
  );
}

function TemplateModal({
  editing,
  form,
  setForm,
  saving,
  formError,
  onClose,
  onSubmit,
}: {
  editing: PaymentTemplate | null;
  form: TemplateForm;
  setForm: React.Dispatch<React.SetStateAction<TemplateForm>>;
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
          {editing ? "Επεξεργασία Προτύπου" : "Νέο Πρότυπο"}
        </h2>

        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Όνομα" required>
            <input
              type="text"
              required
              value={form.label}
              onChange={(e) =>
                setForm((s) => ({ ...s, label: e.target.value }))
              }
              placeholder="π.χ. Μηνιαία Συνδρομή"
              className={inputClass}
            />
          </Field>

          <Field label="Ποσό (€)" required>
            <input
              type="text"
              inputMode="decimal"
              required
              value={form.amount}
              onChange={(e) =>
                setForm((s) => ({ ...s, amount: e.target.value }))
              }
              placeholder="0.00"
              className={inputClass}
            />
          </Field>

          <fieldset>
            <legend className="mb-2 block text-xs font-medium text-muted">
              Τύπος <span className="text-danger">*</span>
            </legend>
            <div className="flex gap-2">
              {(["monthly_fee", "annual"] as const).map((opt) => {
                const active = form.payment_type === opt;
                return (
                  <label
                    key={opt}
                    className={
                      "flex flex-1 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition " +
                      (active
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border hover:bg-foreground/5")
                    }
                  >
                    <input
                      type="radio"
                      name="payment_type"
                      value={opt}
                      checked={active}
                      onChange={() =>
                        setForm((s) => ({ ...s, payment_type: opt }))
                      }
                      className="h-4 w-4"
                    />
                    {PAYMENT_TYPE_LABEL[opt]}
                  </label>
                );
              })}
            </div>
          </fieldset>

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

function BulkChargeModal({
  members,
  templates,
  form,
  setForm,
  step,
  preview,
  updatePreviewRow,
  onNext,
  onBack,
  isPrivileged,
  saving,
  formError,
  onClose,
  onSubmit,
}: {
  members: Member[];
  templates: PaymentTemplate[];
  form: BulkForm;
  setForm: React.Dispatch<React.SetStateAction<BulkForm>>;
  step: "config" | "preview";
  preview: BulkPreviewRow[];
  updatePreviewRow: (id: string, patch: Partial<BulkPreviewRow>) => void;
  onNext: () => void;
  onBack: () => void;
  isPrivileged: boolean;
  saving: boolean;
  formError: string | null;
  onClose: () => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) =>
      `${m.last_name} ${m.first_name} ${m.email ?? ""}`
        .toLowerCase()
        .includes(q)
    );
  }, [members, search]);
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((m) => form.selected.has(m.id));

  function toggle(id: string) {
    setForm((s) => {
      const next = new Set(s.selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...s, selected: next };
    });
  }
  function toggleAllFiltered() {
    setForm((s) => {
      const next = new Set(s.selected);
      if (allFilteredSelected) {
        for (const m of filtered) next.delete(m.id);
      } else {
        for (const m of filtered) next.add(m.id);
      }
      return { ...s, selected: next };
    });
  }
  function applyTemplate(id: string) {
    setForm((s) => {
      if (!id) return { ...s, template_id: "" };
      const t = templates.find((x) => x.id === id);
      if (!t) return { ...s, template_id: id };
      return {
        ...s,
        template_id: id,
        type: t.payment_type,
        amount: String(t.amount),
        period:
          t.payment_type === "annual"
            ? currentYearPeriod()
            : currentMonthPeriod(),
      };
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-semibold">
          Μαζική Χρέωση {step === "preview" ? "— Προεπισκόπηση" : ""}
        </h2>
        <p className="mb-4 text-xs text-muted">
          {step === "config"
            ? "Επιλέξτε πρότυπο, περίοδο και μέλη."
            : "Επιβεβαιώστε ή τροποποιήστε τα ποσά πριν την οριστικοποίηση."}
        </p>

        <form
          onSubmit={onSubmit}
          className="flex min-h-0 flex-1 flex-col gap-4"
        >
          {step === "preview" ? (
            <BulkPreviewTable
              preview={preview}
              update={updatePreviewRow}
              isPrivileged={isPrivileged}
            />
          ) : (
          <>
          <Field label="Πρότυπο" required>
            <select
              required
              value={form.template_id}
              onChange={(e) => applyTemplate(e.target.value)}
              className={inputClass}
            >
              <option value="">— Επιλέξτε πρότυπο —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label} — {eur.format(Number(t.amount))} (
                  {PAYMENT_TYPE_LABEL[t.payment_type]})
                </option>
              ))}
            </select>
          </Field>

          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <Field label="Ποσό (€)" required>
              <input
                type="text"
                inputMode="decimal"
                required
                value={form.amount}
                onChange={(e) =>
                  setForm((s) => ({ ...s, amount: e.target.value }))
                }
                placeholder="0.00"
                className={inputClass}
              />
            </Field>
            <div>
              <span className="mb-1 block text-xs font-medium text-muted">
                Τύπος
              </span>
              <div className="flex h-[42px] items-center">
                <PaymentTypeBadge type={form.type} />
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={form.type === "annual" ? "Έτος" : "Μήνας"}
              required
            >
              {form.type === "annual" ? (
                <input
                  type="number"
                  required
                  min={2020}
                  max={2100}
                  value={form.period}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, period: e.target.value }))
                  }
                  placeholder="2026"
                  className={inputClass}
                />
              ) : (
                <input
                  type="month"
                  required
                  value={form.period}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, period: e.target.value }))
                  }
                  className={inputClass}
                />
              )}
            </Field>
            <Field label="Ημερομηνία" required>
              <input
                type="date"
                lang="el"
                required
                value={form.payment_date}
                onChange={(e) =>
                  setForm((s) => ({ ...s, payment_date: e.target.value }))
                }
                className={inputClass}
              />
            </Field>
          </div>

          <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-border">
            <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
              <span className="text-xs font-medium">
                Επιλεγμένα: {form.selected.size} / Σύνολο: {members.length}
              </span>
              <button
                type="button"
                onClick={toggleAllFiltered}
                className="text-xs text-accent transition hover:underline"
              >
                {allFilteredSelected ? "Καθαρισμός" : "Επιλογή όλων"}
              </button>
            </div>
            <div className="border-b border-border px-3 py-2">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Αναζήτηση μέλους…"
                className={inputClass}
              />
            </div>
            <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
              {filtered.length === 0 ? (
                <li className="px-3 py-4 text-center text-xs text-muted">
                  {members.length === 0
                    ? "Δεν υπάρχουν ενεργά μέλη."
                    : "Δεν βρέθηκαν αποτελέσματα."}
                </li>
              ) : (
                filtered.map((m) => {
                  const checked = form.selected.has(m.id);
                  return (
                    <li key={m.id}>
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm transition hover:bg-foreground/5">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(m.id)}
                          className="h-4 w-4 rounded border-border"
                        />
                        <span className="flex-1 truncate">
                          {m.last_name} {m.first_name}
                        </span>
                      </label>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
          </>
          )}

          {formError && (
            <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
              {formError}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            {step === "preview" && (
              <PreviewSummary
                preview={preview}
                isPrivileged={isPrivileged}
              />
            )}
            <button
              type="button"
              onClick={step === "preview" ? onBack : onClose}
              disabled={saving}
              className="rounded-lg border border-border px-4 py-2 text-sm transition hover:bg-background disabled:opacity-50"
            >
              {step === "preview" ? "Πίσω" : "Ακύρωση"}
            </button>
            {step === "config" ? (
              <button
                type="button"
                onClick={onNext}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
              >
                Επόμενο →
              </button>
            ) : (
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Αποθήκευση…" : "Δημιουργία Χρεώσεων"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function BulkPreviewTable({
  preview,
  update,
  isPrivileged,
}: {
  preview: BulkPreviewRow[];
  update: (id: string, patch: Partial<BulkPreviewRow>) => void;
  isPrivileged: boolean;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border bg-background/30 text-xs uppercase tracking-wider text-muted">
          <tr>
            <th className="px-3 py-2">Όνομα</th>
            <th className="px-3 py-2">Κανόνας</th>
            <th className="px-3 py-2 text-right">Αρχικό</th>
            <th className="px-3 py-2 text-right">Έκπτ.</th>
            <th className="px-3 py-2 text-right">Τελικό</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {preview.map((row) => {
            const finalNum = Number(row.final_amount.replace(",", "."));
            const isOverride =
              Number.isFinite(finalNum) &&
              Math.abs(finalNum - row.computed_amount) > 0.005;
            const needsReason = isOverride && !row.override_reason.trim();
            return (
              <Fragment key={row.member_id}>
                <tr
                  className={isOverride ? "bg-amber-500/5" : ""}
                >
                  <td className="px-3 py-2 font-medium">
                    {row.member_name}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted">
                    {row.rule_label ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-muted">
                    {eur.format(row.original_amount)}
                  </td>
                  <td className="px-3 py-2 text-right text-muted">
                    {row.discount_percent > 0
                      ? `−${row.discount_percent}%`
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={row.final_amount}
                      onChange={(e) =>
                        update(row.member_id, {
                          final_amount: e.target.value,
                        })
                      }
                      className="w-24 rounded border border-border bg-background px-2 py-1 text-right text-sm"
                    />
                  </td>
                </tr>
                {isOverride && (
                  <tr className="bg-amber-500/5">
                    <td colSpan={5} className="px-3 pb-2">
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-medium text-amber-700 dark:text-amber-400">
                          Λόγος αλλαγής{" "}
                          <span className="text-danger">*</span>
                          {!isPrivileged &&
                            " — θα χρειαστεί έγκριση προέδρου"}
                        </span>
                        <textarea
                          required
                          rows={2}
                          value={row.override_reason}
                          onChange={(e) =>
                            update(row.member_id, {
                              override_reason: e.target.value,
                            })
                          }
                          className={
                            "w-full rounded border bg-background px-2 py-1 text-xs " +
                            (needsReason
                              ? "border-danger/60"
                              : "border-border")
                          }
                          placeholder="π.χ. Οικονομική δυσκολία οικογένειας"
                        />
                      </label>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PreviewSummary({
  preview,
  isPrivileged,
}: {
  preview: BulkPreviewRow[];
  isPrivileged: boolean;
}) {
  const total = preview.reduce((s, r) => {
    const n = Number(r.final_amount.replace(",", "."));
    return s + (Number.isFinite(n) ? n : 0);
  }, 0);
  const overrides = preview.filter((r) => {
    const n = Number(r.final_amount.replace(",", "."));
    return Number.isFinite(n) && Math.abs(n - r.computed_amount) > 0.005;
  }).length;
  return (
    <div className="mr-auto text-xs text-muted">
      <p>
        Σύνολο:{" "}
        <strong className="text-foreground">{eur.format(total)}</strong> από{" "}
        {preview.length} πληρωμές
      </p>
      {overrides > 0 && !isPrivileged && (
        <p className="mt-0.5 text-amber-700 dark:text-amber-400">
          ⚠️ {overrides}{" "}
          {overrides === 1 ? "πληρωμή χρειάζεται" : "πληρωμές χρειάζονται"}{" "}
          έγκριση προέδρου
        </p>
      )}
    </div>
  );
}

function BatchDeleteModal({
  rows,
  hadApproved,
  isSystemAdmin,
  deleting,
  overrideReason,
  setOverrideReason,
  onCancel,
  onConfirm,
}: {
  rows: PaymentRow[];
  hadApproved: boolean;
  isSystemAdmin: boolean;
  deleting: boolean;
  overrideReason: string;
  setOverrideReason: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const total = rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const blocked = hadApproved && !isSystemAdmin;
  const overrideMode = hadApproved && isSystemAdmin;
  const reasonLength = overrideReason.trim().length;
  const overrideReady = !overrideMode || reasonLength >= 10;

  function renderRowList() {
    return (
      <ul className="mb-3 space-y-1 rounded-lg border border-border bg-background p-3 text-sm">
        {rows.map((r) => {
          const name =
            r.member_last_name || r.member_first_name
              ? `${r.member_last_name ?? ""} ${r.member_first_name ?? ""}`.trim()
              : "—";
          return (
            <li
              key={r.id}
              className="flex items-center justify-between gap-3"
            >
              <span>
                {name}
                {r.approval_status === "approved" && (
                  <span className="ml-2 text-xs text-emerald-700 dark:text-emerald-300">
                    🟢 Εγκρίθηκε
                  </span>
                )}
              </span>
              <span className="font-medium">
                {eur.format(Number(r.amount))}
              </span>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-lg font-semibold">
          Διαγραφή πληρωμής οικογένειας
        </h2>

        {blocked ? (
          <>
            <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
              Αυτή η εγγραφή περιέχει εγκεκριμένες πληρωμές. Επικοινωνήστε με
              τον διαχειριστή του συστήματος για διαγραφή.
            </div>
            {renderRowList()}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-lg border border-border px-4 py-2 text-sm transition hover:bg-background"
              >
                Κλείσιμο
              </button>
            </div>
          </>
        ) : (
          <>
            {overrideMode && (
              <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
                ⚠️ Προσοχή: Διαγραφή εγκεκριμένων πληρωμών. Απαιτείται
                αιτιολογία.
              </div>
            )}
            <p className="mb-3 text-sm text-muted">
              Αυτή η πληρωμή είναι μέρος ομαδικής εγγραφής οικογένειας. Θα
              διαγραφούν και οι {rows.length} πληρωμές:
            </p>
            {renderRowList()}
            <p className="mb-4 text-sm">
              <span className="text-muted">Σύνολο: </span>
              <span className="font-semibold">{eur.format(total)}</span>
            </p>

            {overrideMode && (
              <label className="mb-3 block">
                <span className="mb-1 block text-xs font-medium text-muted">
                  Αιτιολογία διαγραφής{" "}
                  <span className="text-danger">*</span>
                </span>
                <textarea
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  rows={3}
                  required
                  minLength={10}
                  placeholder="Τουλάχιστον 10 χαρακτήρες…"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
                <span className="mt-1 block text-[11px] text-muted">
                  {reasonLength}/10 χαρακτήρες
                </span>
              </label>
            )}

            <p className="mb-4 text-xs text-muted">
              Η ενέργεια δεν αναιρείται. Καταγράφεται σε audit log.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                disabled={deleting}
                className="rounded-lg border border-border px-4 py-2 text-sm transition hover:bg-background disabled:opacity-50"
              >
                Ακύρωση
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={deleting || !overrideReady}
                className={
                  "rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50 " +
                  (overrideMode ? "bg-red-700" : "bg-[#800000]")
                }
              >
                {deleting
                  ? "Διαγραφή…"
                  : overrideMode
                    ? "Διαγραφή με override"
                    : `Ναι, διαγραφή και των ${rows.length}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PaymentModal({
  members,
  templates,
  form,
  setForm,
  saving,
  formError,
  onClose,
  onSubmit,
}: {
  members: Member[];
  templates: PaymentTemplate[];
  form: PaymentForm;
  setForm: React.Dispatch<React.SetStateAction<PaymentForm>>;
  saving: boolean;
  formError: string | null;
  onClose: () => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}) {
  function applyTemplate(id: string) {
    if (!id) {
      setForm((s) => ({ ...s, template_id: "" }));
      return;
    }
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setForm((s) => ({
      ...s,
      template_id: id,
      type: t.payment_type,
      amount: String(t.amount),
      period:
        t.payment_type === "annual" ? currentYearPeriod() : currentMonthPeriod(),
    }));
  }
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
        <h2 className="mb-4 text-lg font-semibold">Νέα Πληρωμή</h2>

        <form onSubmit={onSubmit} className="space-y-4">
          {templates.length > 0 && (
            <Field label="Γρήγορη Επιλογή από Πρότυπο">
              <select
                value={form.template_id}
                onChange={(e) => applyTemplate(e.target.value)}
                className={inputClass}
              >
                <option value="">— Χειροκίνητα —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label} — {eur.format(Number(t.amount))} (
                    {PAYMENT_TYPE_LABEL[t.payment_type]})
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field label="Μέλος" required>
            <select
              required
              value={form.member_id}
              onChange={(e) =>
                setForm((s) => ({ ...s, member_id: e.target.value }))
              }
              className={inputClass}
            >
              <option value="">— Επιλέξτε —</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {formatMemberName(m)}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Τύπος" required>
              <select
                value={form.type}
                onChange={(e) => {
                  const next = e.target.value as PaymentType;
                  setForm((s) => ({
                    ...s,
                    type: next,
                    period:
                      next === "annual" ? currentYearPeriod() : currentMonthPeriod(),
                  }));
                }}
                className={inputClass}
              >
                <option value="monthly_fee">
                  {PAYMENT_TYPE_LABEL.monthly_fee}
                </option>
                <option value="annual">{PAYMENT_TYPE_LABEL.annual}</option>
              </select>
            </Field>
            <Field
              label={form.type === "annual" ? "Έτος" : "Μήνας (YYYY-MM)"}
            >
              <input
                type="text"
                value={form.period}
                onChange={(e) =>
                  setForm((s) => ({ ...s, period: e.target.value }))
                }
                placeholder={form.type === "annual" ? "2026" : "2026-04"}
                className={inputClass}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Ποσό (€)" required>
              <input
                type="text"
                inputMode="decimal"
                required
                value={form.amount}
                onChange={(e) =>
                  setForm((s) => ({ ...s, amount: e.target.value }))
                }
                placeholder="0.00"
                className={inputClass}
              />
            </Field>
            <Field label="Ημερομηνία" required>
              <input
                type="date"
                lang="el"
                required
                value={form.payment_date}
                onChange={(e) =>
                  setForm((s) => ({ ...s, payment_date: e.target.value }))
                }
                className={inputClass}
              />
            </Field>
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
              {saving ? "Αποθήκευση…" : "Καταχώρηση"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Tab 2 — Κρατήσεις Εκδηλώσεων (toggle is_paid)
// ────────────────────────────────────────────────────────────

function ReservationsTab() {
  const { clubId, loading: clubLoading } = useCurrentClub();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [resLoading, setResLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    if (clubLoading || !clubId) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = getBrowserClient();
        const { data, error: qErr } = await supabase
          .from("events")
          .select("*")
          .eq("club_id", clubId)
          .order("event_date", { ascending: false });
        if (cancelled) return;
        if (qErr) throw qErr;
        const list = data ?? [];
        setEvents(list);
        setSelectedEventId((prev) => prev ?? list[0]?.id ?? null);
      } catch (err) {
        if (!cancelled)
          setError(errorMessage(err, "Σφάλμα φόρτωσης εκδηλώσεων."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clubId, clubLoading]);

  useEffect(() => {
    if (!selectedEventId) {
      setReservations([]);
      return;
    }
    let cancelled = false;
    setResLoading(true);
    (async () => {
      try {
        const supabase = getBrowserClient();
        const { data, error: qErr } = await supabase
          .from("reservations")
          .select("*")
          .eq("event_id", selectedEventId)
          .order("group_name", { ascending: true });
        if (cancelled) return;
        if (qErr) throw qErr;
        setReservations(data ?? []);
      } catch (err) {
        if (!cancelled)
          setError(errorMessage(err, "Σφάλμα φόρτωσης κρατήσεων."));
      } finally {
        if (!cancelled) setResLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedEventId]);

  async function togglePaid(r: Reservation) {
    if (!clubId) return;
    const next = !r.is_paid;
    setUpdatingId(r.id);
    setReservations((prev) =>
      prev.map((x) => (x.id === r.id ? { ...x, is_paid: next } : x))
    );
    try {
      const supabase = getBrowserClient();
      const { error: uErr } = await supabase
        .from("reservations")
        .update({ is_paid: next })
        .eq("id", r.id)
        .eq("club_id", clubId);
      if (uErr) throw uErr;
    } catch (err) {
      setReservations((prev) =>
        prev.map((x) => (x.id === r.id ? { ...x, is_paid: r.is_paid } : x))
      );
      setError(errorMessage(err, "Σφάλμα ενημέρωσης κατάστασης."));
    } finally {
      setUpdatingId(null);
    }
  }

  const stats = useMemo(() => {
    const paid = reservations.filter((r) => r.is_paid).length;
    const total = reservations.length;
    const pax = reservations.reduce((s, r) => s + r.pax_count, 0);
    return { paid, total, pending: total - paid, pax };
  }, [reservations]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Field label="Εκδήλωση">
          <select
            value={selectedEventId ?? ""}
            onChange={(e) => setSelectedEventId(e.target.value || null)}
            disabled={loading || events.length === 0}
            className={inputClass + " disabled:opacity-60"}
          >
            {events.length === 0 ? (
              <option value="">— Καμία εκδήλωση —</option>
            ) : (
              events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.event_name} —{" "}
                  {new Date(ev.event_date).toLocaleDateString("el-GR")}
                </option>
              ))
            )}
          </select>
        </Field>
      </div>

      {error && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="shrink-0 rounded px-2 text-xs hover:opacity-70"
          >
            ✕
          </button>
        </div>
      )}

      {selectedEventId && (
        <div className="mb-4 grid gap-3 sm:grid-cols-4">
          <StatPill label="Παρέες" value={stats.total} />
          <StatPill label="Άτομα" value={stats.pax} />
          <StatPill label="Πληρωμένες" value={stats.paid} tone="success" />
          <StatPill label="Εκκρεμείς" value={stats.pending} tone="danger" />
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-background/50 text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-3">Παρέα</th>
                <th className="px-4 py-3">Άτομα</th>
                <th className="px-4 py-3">Τραπέζι</th>
                <th className="px-4 py-3 text-right">Πληρωμή</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {!selectedEventId ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted">
                    Επιλέξτε εκδήλωση.
                  </td>
                </tr>
              ) : resLoading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted">
                    Φόρτωση…
                  </td>
                </tr>
              ) : reservations.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted">
                    Δεν υπάρχουν κρατήσεις για αυτή την εκδήλωση.
                  </td>
                </tr>
              ) : (
                reservations.map((r) => (
                  <tr key={r.id} className="hover:bg-background/40">
                    <td className="px-4 py-3 font-medium">{r.group_name}</td>
                    <td className="px-4 py-3 text-muted">{r.pax_count}</td>
                    <td className="px-4 py-3 text-muted">
                      {r.table_number != null ? `Νο ${r.table_number}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => togglePaid(r)}
                        disabled={updatingId === r.id}
                        className={
                          "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition disabled:opacity-50 " +
                          (r.is_paid
                            ? "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400"
                            : "bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 dark:text-amber-400")
                        }
                      >
                        <span
                          className={
                            "h-1.5 w-1.5 rounded-full " +
                            (r.is_paid ? "bg-emerald-500" : "bg-amber-500")
                          }
                        />
                        {r.is_paid ? "Πληρωμένη" : "Εκκρεμεί"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-500/30 bg-emerald-500/5"
      : tone === "danger"
        ? "border-amber-500/30 bg-amber-500/5"
        : "border-border bg-surface";
  return (
    <div className={"rounded-lg border p-3 " + toneClass}>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">
        {value.toLocaleString("el-GR")}
      </p>
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
