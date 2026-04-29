"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { errorMessage, getBrowserClient } from "@/lib/supabase/client";
import { useCurrentClub } from "@/lib/hooks/useCurrentClub";
import type {
  CalendarEvent,
  CalendarEventCategory,
} from "@/lib/supabase/types";

interface DashboardStats {
  activeMembers: number | null;
  monthRevenue: number | null;
  pendingPayments: number | null;
}

type PendingMember = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
};

type TodayItem = {
  id: string;
  title: string;
  category: CalendarEventCategory;
  startLabel: string | null;
  endLabel: string | null;
  description: string | null;
};

const CATEGORY_LABEL: Record<CalendarEventCategory, string> = {
  lesson: "Μάθημα",
  event: "Εκδήλωση",
  meeting: "Συνεδρίαση Δ.Σ.",
  other: "Άλλο",
};

const CATEGORY_PILL: Record<CalendarEventCategory, string> = {
  lesson: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  event: "bg-red-500/15 text-red-700 dark:text-red-300",
  meeting: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  other: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
};

function currentPeriod(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function todayWeekdayBit(d: Date): number {
  const monIndex = (d.getDay() + 6) % 7;
  return 1 << monIndex;
}

function formatHM(h: number, m: number): string {
  return `${pad2(h)}:${pad2(m)}`;
}

function timeFromTimestamp(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return formatHM(d.getHours(), d.getMinutes());
}

function timeFromClock(t: string | null): string | null {
  if (!t) return null;
  const [h, m] = t.split(":").map((x) => Number(x));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return formatHM(h, m);
}

function compareTime(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.localeCompare(b);
}

const RECURRING_DISABLED_KEY = "dashboard.calendar.recurringDisabled";
const CANCELLATIONS_DISABLED_KEY =
  "dashboard.calendar.cancellationsDisabled";

function readFlag(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}
function writeFlag(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    // ignore
  }
}

function isRecurringDisabled(): boolean {
  return readFlag(RECURRING_DISABLED_KEY);
}
function isCancellationsDisabled(): boolean {
  return readFlag(CANCELLATIONS_DISABLED_KEY);
}
function markRecurringDisabled(err: unknown): void {
  console.warn(
    "[dashboard] disabling recurring calendar query — schema mismatch.",
    err
  );
  writeFlag(RECURRING_DISABLED_KEY);
}
function markCancellationsDisabled(err: unknown): void {
  console.warn(
    "[dashboard] disabling calendar cancellations query — schema mismatch.",
    err
  );
  writeFlag(CANCELLATIONS_DISABLED_KEY);
}

export default function DashboardPage() {
  const { clubId, loading: clubLoading } = useCurrentClub();
  const [stats, setStats] = useState<DashboardStats>({
    activeMembers: null,
    monthRevenue: null,
    pendingPayments: null,
  });
  const [todayItems, setTodayItems] = useState<TodayItem[] | null>(null);
  const [pendingMembers, setPendingMembers] = useState<PendingMember[]>([]);
  const [pendingModalOpen, setPendingModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (clubLoading || !clubId) return;
    let cancelled = false;
    async function loadStats() {
      if (!clubId) return;
      try {
        const supabase = getBrowserClient();
        const period = currentPeriod();

        const [activeRes, paymentsRes, paidRes] = await Promise.all([
          supabase
            .from("members")
            .select("id,first_name,last_name,phone")
            .eq("club_id", clubId)
            .eq("status", "active")
            .order("last_name", { ascending: true })
            .order("first_name", { ascending: true }),
          supabase
            .from("payments")
            .select("amount")
            .eq("club_id", clubId)
            .eq("type", "monthly_fee")
            .eq("period", period),
          supabase
            .from("payments")
            .select("member_id")
            .eq("club_id", clubId)
            .eq("type", "monthly_fee")
            .eq("period", period),
        ]);

        if (cancelled) return;

        if (activeRes.error) throw activeRes.error;
        if (paymentsRes.error) throw paymentsRes.error;
        if (paidRes.error) throw paidRes.error;

        const monthRevenue = (paymentsRes.data ?? []).reduce(
          (sum, p) => sum + Number(p.amount ?? 0),
          0
        );
        const paidMemberIds = new Set(
          (paidRes.data ?? []).map((p) => p.member_id)
        );
        const activeMembers = (activeRes.data ?? []) as PendingMember[];
        const pending = activeMembers.filter((m) => !paidMemberIds.has(m.id));

        setStats({
          activeMembers: activeMembers.length,
          monthRevenue,
          pendingPayments: pending.length,
        });
        setPendingMembers(pending);
      } catch (err) {
        if (!cancelled) {
          setError(errorMessage(err, "Σφάλμα κατά τη φόρτωση των στατιστικών."));
        }
      }
    }

    async function loadToday() {
      if (!clubId) return;
      try {
        const supabase = getBrowserClient();
        const now = new Date();
        const todayStr = dayKey(now);
        const startOfDay = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate()
        );
        const startOfTomorrow = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() + 1
        );
        const todayBit = todayWeekdayBit(now);

        const oneOffRes = await supabase
          .from("calendar_events")
          .select("*")
          .eq("club_id", clubId)
          .eq("is_recurring", false)
          .gte("start_datetime", startOfDay.toISOString())
          .lt("start_datetime", startOfTomorrow.toISOString());

        if (cancelled) return;
        if (oneOffRes.error) throw oneOffRes.error;

        const recurringDisabled = isRecurringDisabled();
        const cancellationsDisabled = isCancellationsDisabled();

        const [recurringRes, cancelRes] = await Promise.all([
          recurringDisabled
            ? Promise.resolve({ data: null, error: null } as const)
            : supabase
                .from("calendar_events")
                .select("*")
                .eq("club_id", clubId)
                .eq("is_recurring", true)
                .lte("start_season_date", todayStr)
                .gte("end_season_date", todayStr),
          cancellationsDisabled
            ? Promise.resolve({ data: null, error: null } as const)
            : supabase
                .from("calendar_event_cancellations")
                .select("calendar_event_id")
                .eq("club_id", clubId)
                .eq("cancelled_date", todayStr),
        ]);

        if (cancelled) return;

        if (recurringRes.error) markRecurringDisabled(recurringRes.error);
        if (cancelRes.error) markCancellationsDisabled(cancelRes.error);

        const cancelledIds = new Set(
          (cancelRes.data ?? []).map((c) => c.calendar_event_id)
        );

        const items: TodayItem[] = [];

        for (const ev of (oneOffRes.data ?? []) as CalendarEvent[]) {
          if (ev.status === "cancelled") continue;
          items.push({
            id: ev.id,
            title: ev.title,
            category: ev.category,
            startLabel: timeFromTimestamp(ev.start_datetime),
            endLabel: timeFromTimestamp(ev.end_datetime),
            description: ev.description,
          });
        }

        const recurringRows = recurringRes.error ? [] : (recurringRes.data ?? []);
        for (const ev of recurringRows as CalendarEvent[]) {
          if (ev.status === "cancelled") continue;
          if ((ev.recurrence_days & todayBit) === 0) continue;
          if (cancelledIds.has(ev.id)) continue;
          items.push({
            id: ev.id,
            title: ev.title,
            category: ev.category,
            startLabel: timeFromClock(ev.start_time),
            endLabel: timeFromClock(ev.end_time),
            description: ev.description,
          });
        }

        items.sort((a, b) => compareTime(a.startLabel, b.startLabel));
        setTodayItems(items);
      } catch (err) {
        if (!cancelled) {
          setError(
            errorMessage(err, "Σφάλμα κατά τη φόρτωση των σημερινών δραστηριοτήτων.")
          );
          setTodayItems([]);
        }
      }
    }

    loadStats();
    loadToday();
    return () => {
      cancelled = true;
    };
  }, [clubId, clubLoading]);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <header className="mb-8">
        <p className="text-sm text-muted">Πίνακας Ελέγχου</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          Καλώς ήρθατε στο SyllogosHub
        </h1>
        <p className="mt-2 text-sm text-muted">
          Σύντομη εικόνα της τρέχουσας κατάστασης του συλλόγου.
        </p>
      </header>

      {error && (
        <div className="mb-6 rounded-lg border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Ενεργά Μέλη"
          value={
            stats.activeMembers === null
              ? "—"
              : stats.activeMembers.toLocaleString("el-GR")
          }
          hint="Μέλη σε ενεργή κατάσταση"
        />
        <StatCard
          label="Έσοδα Μήνα"
          value={
            stats.monthRevenue === null
              ? "—"
              : new Intl.NumberFormat("el-GR", {
                  style: "currency",
                  currency: "EUR",
                }).format(stats.monthRevenue)
          }
          hint={`Μηνιαίες συνδρομές — περίοδος ${currentPeriod()}`}
        />
        <StatCard
          label="Εκκρεμότητες"
          value={
            stats.pendingPayments === null
              ? "—"
              : stats.pendingPayments.toLocaleString("el-GR")
          }
          hint="Μέλη χωρίς πληρωμή για τον τρέχοντα μήνα"
          onClick={
            stats.pendingPayments && stats.pendingPayments > 0
              ? () => setPendingModalOpen(true)
              : undefined
          }
        />
      </div>

      <TodayCard items={todayItems} />

      {pendingModalOpen && (
        <PendingPayersModal
          period={currentPeriod()}
          members={pendingMembers}
          onClose={() => setPendingModalOpen(false)}
        />
      )}

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <Link
          href="/members"
          className="rounded-xl border border-border bg-surface p-6 transition hover:border-accent/60 hover:shadow-sm"
        >
          <h3 className="text-lg font-semibold">Διαχείριση Μελών →</h3>
          <p className="mt-1 text-sm text-muted">
            Προσθήκη, αναζήτηση και επεξεργασία μελών του συλλόγου.
          </p>
        </Link>
        <Link
          href="/seating"
          className="rounded-xl border border-border bg-surface p-6 transition hover:border-accent/60 hover:shadow-sm"
        >
          <h3 className="text-lg font-semibold">Πλάνο Τραπεζιών →</h3>
          <p className="mt-1 text-sm text-muted">
            Διαχείριση παρεών και ανάθεση τραπεζιών για τις εκδηλώσεις.
          </p>
        </Link>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  onClick,
}: {
  label: string;
  value: string;
  hint: string;
  onClick?: () => void;
}) {
  const className =
    "rounded-xl border border-border bg-surface p-6 text-left " +
    (onClick
      ? "cursor-pointer transition hover:border-accent/60 hover:shadow-sm"
      : "");
  const inner = (
    <>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
      <p className="mt-3 text-xs text-muted">
        {hint}
        {onClick && (
          <span className="ml-1 text-accent">— Δείτε λίστα →</span>
        )}
      </p>
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className + " w-full"}>
        {inner}
      </button>
    );
  }
  return <div className={className}>{inner}</div>;
}

function PendingPayersModal({
  period,
  members,
  onClose,
}: {
  period: string;
  members: PendingMember[];
  onClose: () => void;
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
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Εκκρεμείς Συνδρομές</h2>
            <p className="text-xs text-muted">Περίοδος {period}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Κλείσιμο"
            className="rounded px-2 text-sm text-muted hover:text-foreground"
          >
            ✕
          </button>
        </header>

        {members.length === 0 ? (
          <p className="text-sm text-muted">Δεν υπάρχουν εκκρεμότητες.</p>
        ) : (
          <ul className="max-h-80 divide-y divide-border overflow-y-auto">
            {members.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 py-2"
              >
                <span className="truncate font-medium">
                  {m.last_name} {m.first_name}
                </span>
                {m.phone ? (
                  <a
                    href={`tel:${m.phone}`}
                    className="shrink-0 text-xs text-accent hover:underline"
                  >
                    {m.phone}
                  </a>
                ) : (
                  <span className="shrink-0 text-xs text-muted">—</span>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            Κλείσιμο
          </button>
        </div>
      </div>
    </div>
  );
}

function TodayCard({ items }: { items: TodayItem[] | null }) {
  return (
    <section className="mt-8 rounded-xl border border-border bg-surface p-6">
      <header className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Σήμερα στον Σύλλογο</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">
            Δραστηριότητες της ημέρας
          </h2>
        </div>
        <Link
          href="/calendar"
          className="text-xs text-muted transition hover:text-accent"
        >
          Ημερολόγιο →
        </Link>
      </header>

      {items === null ? (
        <p className="text-sm text-muted">Φόρτωση…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted">Δεν υπάρχουν δραστηριότητες σήμερα.</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((it) => (
            <li
              key={it.id}
              className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="w-20 shrink-0 text-sm font-medium tabular-nums">
                {it.startLabel ?? "—"}
                {it.endLabel && (
                  <span className="block text-[11px] font-normal text-muted">
                    έως {it.endLabel}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{it.title}</p>
                {it.description && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted">
                    {it.description}
                  </p>
                )}
              </div>
              <span
                className={
                  "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium " +
                  CATEGORY_PILL[it.category]
                }
              >
                {CATEGORY_LABEL[it.category]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
