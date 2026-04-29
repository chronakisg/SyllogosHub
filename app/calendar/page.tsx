"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { errorMessage, getBrowserClient } from "@/lib/supabase/client";
import { isAdmin, useRole } from "@/lib/hooks/useRole";
import type {
  CalendarEvent,
  CalendarEventCancellation,
  CalendarEventCategory,
  CalendarEventInsert,
  CalendarEventStatus,
  CalendarEventUpdate,
  Member,
} from "@/lib/supabase/types";

type CalendarItem = {
  key: string;
  source: "calendar" | "event";
  occurrenceDate: Date;
  title: string;
  description: string | null;
  category: CalendarEventCategory;
  startAt: Date | null;
  endAt: Date | null;
  cancelled: boolean;
  raw?: CalendarEvent;
  coordinatorId?: string | null;
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

const CATEGORY_DOT: Record<CalendarEventCategory, string> = {
  lesson: "bg-blue-500",
  event: "bg-red-500",
  meeting: "bg-amber-500",
  other: "bg-slate-500",
};

const WEEKDAYS = [
  { idx: 0, short: "Δευ", long: "Δευτέρα", bit: 1 },
  { idx: 1, short: "Τρί", long: "Τρίτη", bit: 2 },
  { idx: 2, short: "Τετ", long: "Τετάρτη", bit: 4 },
  { idx: 3, short: "Πέμ", long: "Πέμπτη", bit: 8 },
  { idx: 4, short: "Παρ", long: "Παρασκευή", bit: 16 },
  { idx: 5, short: "Σάβ", long: "Σάββατο", bit: 32 },
  { idx: 6, short: "Κυρ", long: "Κυριακή", bit: 64 },
] as const;

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}
function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function monthLabel(d: Date): string {
  return d.toLocaleDateString("el-GR", { month: "long", year: "numeric" });
}
function monIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}
function buildMonthGrid(monthAnchor: Date): Date[] {
  const first = startOfMonth(monthAnchor);
  const dayOfWeek = monIndex(first);
  const gridStart = addDays(first, -dayOfWeek);
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}
function localDateTimeInput(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function formatTime(t: string | null): string {
  if (!t) return "";
  return t.slice(0, 5);
}
function combineDateAndTime(date: Date, time: string | null): Date {
  if (!time) return new Date(date);
  const [h, m] = time.split(":").map((x) => Number(x));
  const d = new Date(date);
  d.setHours(Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0, 0, 0);
  return d;
}

type CalendarView = "day" | "week" | "month" | "year";

const VIEW_STORAGE_KEY = "calendar.view";

function isCalendarView(v: string | null | undefined): v is CalendarView {
  return v === "day" || v === "week" || v === "month" || v === "year";
}

const HOURS_24 = Array.from({ length: 24 }, (_, i) => i);
const HOUR_PX = 48;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
function addYears(d: Date, n: number): Date {
  return new Date(d.getFullYear() + n, d.getMonth(), d.getDate());
}
function startOfWeek(d: Date): Date {
  return addDays(startOfDay(d), -monIndex(d));
}
function buildWeekGrid(anchor: Date): Date[] {
  const start = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}
function minutesSinceMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}
function timeRangeText(it: CalendarItem): string | null {
  if (!it.startAt) return null;
  const s = `${pad2(it.startAt.getHours())}:${pad2(it.startAt.getMinutes())}`;
  if (!it.endAt) return s;
  return `${s} – ${pad2(it.endAt.getHours())}:${pad2(it.endAt.getMinutes())}`;
}

export default function CalendarPage() {
  const role = useRole();
  const [memberId, setMemberId] = useState<string | null>(null);

  const [view, setView] = useState<CalendarView>("month");
  const [anchor, setAnchor] = useState<Date>(() => startOfDay(new Date()));
  const [calendarRows, setCalendarRows] = useState<CalendarEvent[]>([]);
  const [cancellations, setCancellations] = useState<
    CalendarEventCancellation[]
  >([]);
  const [eventRows, setEventRows] = useState<
    Array<{ id: string; event_name: string; event_date: string }>
  >([]);
  const [coordinators, setCoordinators] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [detailItem, setDetailItem] = useState<CalendarItem | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [editorDefaultDate, setEditorDefaultDate] = useState<Date | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
      if (isCalendarView(stored)) setView(stored);
    } catch {
      // ignore storage errors (private mode, quota, etc.)
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, view);
    } catch {
      // ignore
    }
  }, [view]);

  useEffect(() => {
    const email = role.email;
    if (!email) {
      setMemberId(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const supabase = getBrowserClient();
        const { data, error: qErr } = await supabase
          .from("members")
          .select("id")
          .eq("email", email)
          .maybeSingle();
        if (cancelled) return;
        if (qErr) return;
        setMemberId(data?.id ?? null);
      } catch {
        if (!cancelled) setMemberId(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [role.email]);

  const load = useCallback(async () => {
    try {
      const supabase = getBrowserClient();
      const [cRes, xRes, eRes, mRes] = await Promise.all([
        supabase.from("calendar_events").select("*"),
        supabase.from("calendar_event_cancellations").select("*"),
        supabase
          .from("events")
          .select("id, event_name, event_date")
          .order("event_date", { ascending: true }),
        supabase
          .from("members")
          .select("*")
          .eq("status", "active")
          .order("last_name", { ascending: true })
          .order("first_name", { ascending: true }),
      ]);
      if (cRes.error) throw cRes.error;
      if (xRes.error) throw xRes.error;
      if (eRes.error) throw eRes.error;
      if (mRes.error) throw mRes.error;
      setCalendarRows(cRes.data ?? []);
      setCancellations(xRes.data ?? []);
      setEventRows(eRes.data ?? []);
      setCoordinators(mRes.data ?? []);
      setError(null);
    } catch (err) {
      setError(errorMessage(err, "Σφάλμα φόρτωσης ημερολογίου."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const cancelledByEvent = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const c of cancellations) {
      const set = m.get(c.calendar_event_id) ?? new Set<string>();
      set.add(c.cancelled_date);
      m.set(c.calendar_event_id, set);
    }
    return m;
  }, [cancellations]);

  const visibleRange = useMemo(() => {
    if (view === "day") {
      const d = startOfDay(anchor);
      return { from: d, to: d };
    }
    if (view === "week") {
      const start = startOfWeek(anchor);
      return { from: start, to: addDays(start, 6) };
    }
    if (view === "month") {
      const grid = buildMonthGrid(startOfMonth(anchor));
      return { from: grid[0], to: grid[grid.length - 1] };
    }
    return {
      from: new Date(anchor.getFullYear(), 0, 1),
      to: new Date(anchor.getFullYear(), 11, 31),
    };
  }, [view, anchor]);

  const itemsByDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    const rangeStart = visibleRange.from;
    const rangeEnd = visibleRange.to;

    function push(day: Date, item: CalendarItem) {
      const key = dayKey(day);
      const arr = map.get(key) ?? [];
      arr.push(item);
      map.set(key, arr);
    }

    for (const ev of calendarRows) {
      if (ev.is_recurring) {
        if (!ev.start_season_date || !ev.end_season_date) continue;
        const seasonStart = startOfDay(new Date(`${ev.start_season_date}T00:00:00`));
        const seasonEnd = startOfDay(new Date(`${ev.end_season_date}T00:00:00`));
        const from = seasonStart > rangeStart ? seasonStart : rangeStart;
        const to = seasonEnd < rangeEnd ? seasonEnd : rangeEnd;
        if (from > to) continue;
        const cancelledDates = cancelledByEvent.get(ev.id) ?? new Set<string>();
        for (let d = new Date(from); d <= to; d = addDays(d, 1)) {
          const bit = WEEKDAYS[monIndex(d)].bit;
          if ((ev.recurrence_days & bit) === 0) continue;
          const dk = dayKey(d);
          const start = combineDateAndTime(d, ev.start_time);
          const end = ev.end_time ? combineDateAndTime(d, ev.end_time) : null;
          push(d, {
            key: `c:${ev.id}:${dk}`,
            source: "calendar",
            occurrenceDate: startOfDay(d),
            title: ev.title,
            description: ev.description,
            category: ev.category,
            startAt: start,
            endAt: end,
            cancelled: ev.status === "cancelled" || cancelledDates.has(dk),
            raw: ev,
            coordinatorId: ev.coordinator_id,
          });
        }
      } else {
        if (!ev.start_datetime) continue;
        const start = new Date(ev.start_datetime);
        const startDay = startOfDay(start);
        if (startDay < rangeStart || startDay > rangeEnd) continue;
        push(start, {
          key: `c:${ev.id}`,
          source: "calendar",
          occurrenceDate: startDay,
          title: ev.title,
          description: ev.description,
          category: ev.category,
          startAt: start,
          endAt: ev.end_datetime ? new Date(ev.end_datetime) : null,
          cancelled: ev.status === "cancelled",
          raw: ev,
          coordinatorId: ev.coordinator_id,
        });
      }
    }

    for (const ev of eventRows) {
      const day = new Date(`${ev.event_date}T00:00:00`);
      if (day < rangeStart || day > rangeEnd) continue;
      push(day, {
        key: `e:${ev.id}`,
        source: "event",
        occurrenceDate: startOfDay(day),
        title: ev.event_name,
        description: null,
        category: "event",
        startAt: null,
        endAt: null,
        cancelled: false,
      });
    }

    for (const arr of map.values()) {
      arr.sort((a, b) => {
        const ta = a.startAt?.getTime() ?? 0;
        const tb = b.startAt?.getTime() ?? 0;
        return ta - tb;
      });
    }
    return map;
  }, [calendarRows, eventRows, cancelledByEvent, visibleRange]);

  const isAdminUser = isAdmin(role.role);

  function canManageItem(item: CalendarItem): boolean {
    if (item.source !== "calendar") return false;
    if (isAdminUser) return true;
    if (memberId && item.coordinatorId === memberId) return true;
    return false;
  }

  function openCreate(date: Date) {
    setEditing(null);
    setEditorDefaultDate(date);
    setEditorOpen(true);
  }

  function openEdit(item: CalendarItem) {
    if (item.source !== "calendar" || !item.raw) return;
    setEditing(item.raw);
    setEditorDefaultDate(null);
    setEditorOpen(true);
    setDetailItem(null);
  }

  async function handleSave(input: CalendarEventInsert & { id?: string }) {
    const supabase = getBrowserClient();
    if (input.id) {
      const { id, ...rest } = input;
      const update: CalendarEventUpdate = rest;
      const { error: uErr } = await supabase
        .from("calendar_events")
        .update(update)
        .eq("id", id);
      if (uErr) throw uErr;
    } else {
      const { error: iErr } = await supabase
        .from("calendar_events")
        .insert(input);
      if (iErr) throw iErr;
    }
    await load();
  }

  async function handleDeleteEvent(item: CalendarItem) {
    if (item.source !== "calendar" || !item.raw) return;
    const ok = window.confirm(
      `Διαγραφή του «${item.title}»; Αν είναι επαναλαμβανόμενο, διαγράφεται όλη η σεζόν.`
    );
    if (!ok) return;
    try {
      const supabase = getBrowserClient();
      const { error: dErr } = await supabase
        .from("calendar_events")
        .delete()
        .eq("id", item.raw.id);
      if (dErr) throw dErr;
      setDetailItem(null);
      await load();
    } catch (err) {
      setError(errorMessage(err, "Σφάλμα διαγραφής."));
    }
  }

  async function toggleSingleDayCancellation(item: CalendarItem) {
    if (item.source !== "calendar" || !item.raw) return;
    if (!item.raw.is_recurring) {
      // For non-recurring, toggle the parent status field instead.
      try {
        const supabase = getBrowserClient();
        const next: CalendarEventStatus =
          item.raw.status === "cancelled" ? "active" : "cancelled";
        const { error: uErr } = await supabase
          .from("calendar_events")
          .update({ status: next })
          .eq("id", item.raw.id);
        if (uErr) throw uErr;
        setDetailItem(null);
        await load();
      } catch (err) {
        setError(errorMessage(err, "Σφάλμα ενημέρωσης κατάστασης."));
      }
      return;
    }

    const dk = dayKey(item.occurrenceDate);
    try {
      const supabase = getBrowserClient();
      const existing = cancellations.find(
        (c) =>
          c.calendar_event_id === item.raw!.id && c.cancelled_date === dk
      );
      if (existing) {
        const { error: dErr } = await supabase
          .from("calendar_event_cancellations")
          .delete()
          .eq("id", existing.id);
        if (dErr) throw dErr;
      } else {
        const { error: iErr } = await supabase
          .from("calendar_event_cancellations")
          .insert({
            calendar_event_id: item.raw.id,
            cancelled_date: dk,
          });
        if (iErr) throw iErr;
      }
      setDetailItem(null);
      await load();
    } catch (err) {
      setError(errorMessage(err, "Σφάλμα ακύρωσης ημέρας."));
    }
  }

  function goPrev() {
    setAnchor((d) => {
      if (view === "day") return addDays(d, -1);
      if (view === "week") return addDays(d, -7);
      if (view === "month") return addMonths(d, -1);
      return addYears(d, -1);
    });
  }
  function goNext() {
    setAnchor((d) => {
      if (view === "day") return addDays(d, 1);
      if (view === "week") return addDays(d, 7);
      if (view === "month") return addMonths(d, 1);
      return addYears(d, 1);
    });
  }
  function goToday() {
    setAnchor(startOfDay(new Date()));
  }
  function selectMonth(monthDate: Date) {
    setAnchor(startOfMonth(monthDate));
    setView("month");
  }

  const today = startOfDay(new Date());

  const headerLabel = (() => {
    if (view === "day") {
      return anchor.toLocaleDateString("el-GR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    }
    if (view === "week") {
      const start = startOfWeek(anchor);
      const end = addDays(start, 6);
      const startTxt = start.toLocaleDateString("el-GR", {
        day: "numeric",
        month: isSameMonth(start, end) ? undefined : "short",
      });
      const endTxt = end.toLocaleDateString("el-GR", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
      return `${startTxt} – ${endTxt}`;
    }
    if (view === "month") {
      return monthLabel(anchor);
    }
    return String(anchor.getFullYear());
  })();

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">Ημερολόγιο</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Κεντρικό Ημερολόγιο
          </h1>
          <p className="mt-1 text-sm text-muted">
            Μαθήματα σεζόν, εκδηλώσεις και συνεδριάσεις του συλλόγου.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ViewTabs value={view} onChange={setView} />
          <button
            type="button"
            onClick={goPrev}
            aria-label="Προηγούμενο"
            className="rounded-lg border border-border px-3 py-2 text-sm transition hover:bg-background"
          >
            ←
          </button>
          <button
            type="button"
            onClick={goToday}
            className="rounded-lg border border-border px-3 py-2 text-sm transition hover:bg-background"
          >
            Σήμερα
          </button>
          <button
            type="button"
            onClick={goNext}
            aria-label="Επόμενο"
            className="rounded-lg border border-border px-3 py-2 text-sm transition hover:bg-background"
          >
            →
          </button>
          {isAdminUser && (
            <button
              type="button"
              onClick={() =>
                openCreate(view === "year" ? today : startOfDay(anchor))
              }
              className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition hover:opacity-90"
            >
              + Νέο
            </button>
          )}
        </div>
      </header>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold capitalize">{headerLabel}</h2>
        <div className="flex flex-wrap gap-2 text-xs text-muted">
          {(Object.keys(CATEGORY_LABEL) as CalendarEventCategory[]).map((c) => (
            <span key={c} className="inline-flex items-center gap-1.5">
              <span className={"h-2 w-2 rounded-full " + CATEGORY_DOT[c]} />
              {CATEGORY_LABEL[c]}
            </span>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        {loading ? (
          <div className="rounded-xl border border-border bg-surface p-10 text-center text-muted">
            Φόρτωση…
          </div>
        ) : view === "day" ? (
          <DayView
            date={startOfDay(anchor)}
            today={today}
            items={itemsByDay.get(dayKey(anchor)) ?? []}
            onItemClick={setDetailItem}
          />
        ) : view === "week" ? (
          <WeekView
            weekStart={startOfWeek(anchor)}
            today={today}
            itemsByDay={itemsByDay}
            onItemClick={setDetailItem}
          />
        ) : view === "month" ? (
          <MonthView
            monthAnchor={startOfMonth(anchor)}
            today={today}
            itemsByDay={itemsByDay}
            isAdminUser={isAdminUser}
            onItemClick={setDetailItem}
            onCreate={openCreate}
          />
        ) : (
          <YearView
            year={anchor.getFullYear()}
            today={today}
            itemsByDay={itemsByDay}
            onSelectMonth={selectMonth}
          />
        )}
      </div>

      {detailItem && (
        <DetailModal
          item={detailItem}
          coordinator={
            detailItem.coordinatorId
              ? coordinators.find((m) => m.id === detailItem.coordinatorId) ??
                null
              : null
          }
          canManage={canManageItem(detailItem)}
          onClose={() => setDetailItem(null)}
          onEdit={() => openEdit(detailItem)}
          onDelete={() => handleDeleteEvent(detailItem)}
          onToggleCancel={() => toggleSingleDayCancellation(detailItem)}
        />
      )}

      {editorOpen && (
        <EventEditor
          editing={editing}
          defaultDate={editorDefaultDate}
          coordinators={coordinators}
          onClose={() => {
            setEditorOpen(false);
            setEditing(null);
          }}
          onSubmit={async (input) => {
            await handleSave(input);
            setEditorOpen(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function ViewTabs({
  value,
  onChange,
}: {
  value: CalendarView;
  onChange: (v: CalendarView) => void;
}) {
  const tabs: Array<{ id: CalendarView; label: string }> = [
    { id: "day", label: "Ημέρα" },
    { id: "week", label: "Εβδομάδα" },
    { id: "month", label: "Μήνας" },
    { id: "year", label: "Έτος" },
  ];
  return (
    <div
      role="tablist"
      aria-label="Προβολή ημερολογίου"
      className="inline-flex rounded-lg border border-border bg-surface p-0.5"
    >
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={
              "rounded-md px-3 py-1.5 text-sm transition " +
              (active
                ? "bg-accent text-white"
                : "text-muted hover:text-foreground")
            }
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function HourGutter() {
  return (
    <div className="w-14 shrink-0 border-r border-border">
      {HOURS_24.map((h) => (
        <div
          key={h}
          className="relative pr-2 text-right text-[11px] text-muted"
          style={{ height: HOUR_PX }}
        >
          <span className="absolute -top-1.5 right-2">{pad2(h)}:00</span>
        </div>
      ))}
    </div>
  );
}

function HourColumn({
  items,
  onItemClick,
}: {
  items: CalendarItem[];
  onItemClick: (it: CalendarItem) => void;
}) {
  return (
    <div className="relative flex-1" style={{ height: HOUR_PX * 24 }}>
      {HOURS_24.map((h) => (
        <div
          key={h}
          className="absolute left-0 right-0 border-t border-border/60"
          style={{ top: h * HOUR_PX }}
        />
      ))}
      {items.map((it) => {
        if (!it.startAt) return null;
        const startMin = minutesSinceMidnight(it.startAt);
        const endMin = it.endAt ? minutesSinceMidnight(it.endAt) : startMin + 60;
        const top = (startMin / 60) * HOUR_PX;
        const rawHeight =
          ((Math.max(endMin, startMin + 30) - startMin) / 60) * HOUR_PX;
        const height = Math.max(rawHeight - 2, 22);
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onItemClick(it)}
            title={`${it.title} — ${CATEGORY_LABEL[it.category]}${it.cancelled ? " (Ακυρωμένο)" : ""}`}
            className={
              "absolute overflow-hidden rounded-md px-2 py-0.5 text-left text-[11px] transition hover:opacity-80 " +
              CATEGORY_PILL[it.category] +
              (it.cancelled ? " opacity-60 line-through decoration-2" : "")
            }
            style={{ top, height, left: 4, right: 4 }}
          >
            <div className="truncate font-medium">{it.title}</div>
            {height > 30 && (
              <div className="truncate text-[10px] opacity-80">
                {timeRangeText(it)}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

function DayView({
  date,
  today,
  items,
  onItemClick,
}: {
  date: Date;
  today: Date;
  items: CalendarItem[];
  onItemClick: (it: CalendarItem) => void;
}) {
  const isToday = isSameDay(date, today);
  const allDay = items.filter((it) => !it.startAt);
  const timed = items.filter((it) => it.startAt);
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="border-b border-border bg-background/50 px-4 py-2 text-sm">
        <span
          className={
            "capitalize " + (isToday ? "font-semibold text-accent" : "")
          }
        >
          {date.toLocaleDateString("el-GR", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </span>
      </div>
      {allDay.length > 0 && (
        <div className="border-b border-border bg-background/30 px-4 py-2">
          <p className="mb-1 text-[10px] uppercase tracking-wider text-muted">
            Όλη μέρα
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {allDay.map((it) => (
              <li key={it.key}>
                <button
                  type="button"
                  onClick={() => onItemClick(it)}
                  className={
                    "rounded px-2 py-0.5 text-xs font-medium transition hover:opacity-80 " +
                    CATEGORY_PILL[it.category] +
                    (it.cancelled
                      ? " opacity-60 line-through decoration-2"
                      : "")
                  }
                >
                  {it.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex">
        <HourGutter />
        <HourColumn items={timed} onItemClick={onItemClick} />
      </div>
    </div>
  );
}

function WeekView({
  weekStart,
  today,
  itemsByDay,
  onItemClick,
}: {
  weekStart: Date;
  today: Date;
  itemsByDay: Map<string, CalendarItem[]>;
  onItemClick: (it: CalendarItem) => void;
}) {
  const days = useMemo(() => buildWeekGrid(weekStart), [weekStart]);
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="overflow-x-auto">
        <div className="min-w-[42rem]">
          <div className="flex border-b border-border bg-background/50">
            <div className="w-14 shrink-0 border-r border-border" />
            {days.map((d, i) => {
              const isToday = isSameDay(d, today);
              return (
                <div
                  key={d.toISOString()}
                  className="flex flex-1 items-center justify-between border-r border-border px-2 py-2 last:border-r-0"
                >
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted">
                      {WEEKDAYS[i].short}
                    </div>
                    <div
                      className={
                        "text-sm " +
                        (isToday
                          ? "font-semibold text-accent"
                          : "text-foreground")
                      }
                    >
                      {d.getDate()}/{pad2(d.getMonth() + 1)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex">
            <HourGutter />
            {days.map((d) => {
              const dayItems = itemsByDay.get(dayKey(d)) ?? [];
              const timed = dayItems.filter((it) => it.startAt);
              return (
                <div
                  key={d.toISOString()}
                  className="flex flex-1 border-r border-border last:border-r-0"
                >
                  <HourColumn items={timed} onItemClick={onItemClick} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function MonthView({
  monthAnchor,
  today,
  itemsByDay,
  isAdminUser,
  onItemClick,
  onCreate,
}: {
  monthAnchor: Date;
  today: Date;
  itemsByDay: Map<string, CalendarItem[]>;
  isAdminUser: boolean;
  onItemClick: (it: CalendarItem) => void;
  onCreate: (date: Date) => void;
}) {
  const grid = useMemo(() => buildMonthGrid(monthAnchor), [monthAnchor]);
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface">
      <div className="grid shrink-0 grid-cols-7 border-b border-border bg-background/50 text-xs uppercase tracking-wider text-muted">
        {WEEKDAYS.map((d) => (
          <div key={d.short} className="px-2 py-2 text-center">
            {d.short}
          </div>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7 overflow-auto">
        {grid.map((day) => {
          const inMonth = isSameMonth(day, monthAnchor);
          const isToday = isSameDay(day, today);
          const dayItems = itemsByDay.get(dayKey(day)) ?? [];
          const clickable = isAdminUser && inMonth;
          return (
            <div
              key={day.toISOString()}
              role={clickable ? "button" : undefined}
              tabIndex={clickable ? 0 : undefined}
              onClick={clickable ? () => onCreate(day) : undefined}
              onKeyDown={
                clickable
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onCreate(day);
                      }
                    }
                  : undefined
              }
              aria-label={
                clickable
                  ? `Προσθήκη καταχώρησης για ${day.toLocaleDateString("el-GR")}`
                  : undefined
              }
              className={
                "min-h-[80px] border-b border-r border-border p-2 align-top transition " +
                (inMonth ? "" : "bg-background/30 text-muted ") +
                (clickable ? "cursor-pointer hover:bg-foreground/5 " : "")
              }
            >
              <div className="mb-1 flex items-center">
                <span
                  className={
                    "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs " +
                    (isToday
                      ? "bg-accent text-white font-semibold"
                      : "text-foreground")
                  }
                >
                  {day.getDate()}
                </span>
              </div>
              <ul className="flex flex-col gap-1">
                {dayItems.slice(0, 4).map((it) => (
                  <li key={it.key}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onItemClick(it);
                      }}
                      title={`${it.title} — ${CATEGORY_LABEL[it.category]}${it.cancelled ? " (Ακυρωμένο)" : ""}`}
                      className={
                        "flex w-full items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium transition hover:opacity-80 " +
                        CATEGORY_PILL[it.category] +
                        (it.cancelled
                          ? " opacity-60 line-through decoration-2"
                          : "")
                      }
                    >
                      {it.startAt && (
                        <span className="opacity-70">
                          {pad2(it.startAt.getHours())}:
                          {pad2(it.startAt.getMinutes())}
                        </span>
                      )}
                      <span className="truncate">{it.title}</span>
                    </button>
                  </li>
                ))}
                {dayItems.length > 4 && (
                  <li className="px-1.5 text-[10px] text-muted">
                    +{dayItems.length - 4} ακόμη
                  </li>
                )}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function YearView({
  year,
  today,
  itemsByDay,
  onSelectMonth,
}: {
  year: number;
  today: Date;
  itemsByDay: Map<string, CalendarItem[]>;
  onSelectMonth: (m: Date) => void;
}) {
  const months = useMemo(
    () => Array.from({ length: 12 }, (_, i) => new Date(year, i, 1)),
    [year]
  );
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {months.map((m) => (
        <button
          key={m.toISOString()}
          type="button"
          onClick={() => onSelectMonth(m)}
          className="group rounded-xl border border-border bg-surface p-4 text-left transition hover:border-accent/60 hover:shadow-sm"
        >
          <p className="mb-2 text-sm font-medium capitalize transition group-hover:text-accent">
            {m.toLocaleDateString("el-GR", { month: "long" })}
          </p>
          <MiniMonthGrid
            monthAnchor={m}
            today={today}
            itemsByDay={itemsByDay}
          />
        </button>
      ))}
    </div>
  );
}

function MiniMonthGrid({
  monthAnchor,
  today,
  itemsByDay,
}: {
  monthAnchor: Date;
  today: Date;
  itemsByDay: Map<string, CalendarItem[]>;
}) {
  const grid = useMemo(() => buildMonthGrid(monthAnchor), [monthAnchor]);
  return (
    <div className="grid grid-cols-7 gap-y-1 text-center text-[10px]">
      {WEEKDAYS.map((d) => (
        <div key={d.short} className="text-muted">
          {d.short.charAt(0)}
        </div>
      ))}
      {grid.map((d) => {
        const inMonth = isSameMonth(d, monthAnchor);
        const isToday = isSameDay(d, today);
        const items = itemsByDay.get(dayKey(d)) ?? [];
        const cats = inMonth
          ? Array.from(
              new Set(
                items.filter((i) => !i.cancelled).map((i) => i.category)
              )
            )
          : [];
        return (
          <div
            key={d.toISOString()}
            className={
              "relative flex aspect-square flex-col items-center justify-center " +
              (inMonth ? "text-foreground" : "text-muted/40")
            }
          >
            <span
              className={
                "leading-none " +
                (isToday
                  ? "flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] font-semibold text-white"
                  : "")
              }
            >
              {d.getDate()}
            </span>
            {cats.length > 0 && (
              <div className="mt-0.5 flex gap-0.5">
                {cats.slice(0, 4).map((c) => (
                  <span
                    key={c}
                    className={"h-1 w-1 rounded-full " + CATEGORY_DOT[c]}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DetailModal({
  item,
  coordinator,
  canManage,
  onClose,
  onEdit,
  onDelete,
  onToggleCancel,
}: {
  item: CalendarItem;
  coordinator: Member | null;
  canManage: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleCancel: () => void;
}) {
  const dateTxt = item.occurrenceDate.toLocaleDateString("el-GR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const timeTxt = item.startAt
    ? `${String(item.startAt.getHours()).padStart(2, "0")}:${String(item.startAt.getMinutes()).padStart(2, "0")}` +
      (item.endAt
        ? ` — ${String(item.endAt.getHours()).padStart(2, "0")}:${String(item.endAt.getMinutes()).padStart(2, "0")}`
        : "")
    : null;
  const isRecurring = item.raw?.is_recurring ?? false;

  return (
    <Modal title={item.title} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={
              "rounded-full px-2 py-0.5 text-xs font-medium " +
              CATEGORY_PILL[item.category]
            }
          >
            {CATEGORY_LABEL[item.category]}
          </span>
          {item.cancelled && (
            <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs text-danger">
              Ακυρωμένο
            </span>
          )}
          {item.source === "event" && (
            <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
              Από Εκδηλώσεις
            </span>
          )}
          {isRecurring && (
            <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
              Επαναλαμβανόμενο
            </span>
          )}
        </div>
        <p className="text-muted">
          <span className="capitalize">{dateTxt}</span>
          {timeTxt ? ` · ${timeTxt}` : ""}
        </p>
        {coordinator && (
          <p className="text-xs text-muted">
            Υπεύθυνος: {coordinator.last_name} {coordinator.first_name}
          </p>
        )}
        {item.description && (
          <p className="whitespace-pre-wrap text-foreground/90">
            {item.description}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          {canManage && (
            <>
              <button
                type="button"
                onClick={onToggleCancel}
                className="rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs text-amber-600 transition hover:bg-amber-500/10 dark:text-amber-400"
              >
                {item.cancelled
                  ? "Επαναφορά"
                  : isRecurring
                    ? "Ακύρωση μόνο αυτής της ημέρας"
                    : "Ακύρωση"}
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="rounded-lg border border-danger/30 px-3 py-1.5 text-xs text-danger transition hover:bg-danger/10"
              >
                {isRecurring ? "Διαγραφή σεζόν" : "Διαγραφή"}
              </button>
              <button
                type="button"
                onClick={onEdit}
                className="rounded-lg border border-border px-3 py-1.5 text-xs transition hover:bg-background"
              >
                Επεξεργασία
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90"
          >
            Κλείσιμο
          </button>
        </div>
      </div>
    </Modal>
  );
}

function EventEditor({
  editing,
  defaultDate,
  coordinators,
  onClose,
  onSubmit,
}: {
  editing: CalendarEvent | null;
  defaultDate: Date | null;
  coordinators: Member[];
  onClose: () => void;
  onSubmit: (
    input: CalendarEventInsert & { id?: string }
  ) => Promise<void>;
}) {
  function defaultStartDateTime(): string {
    if (editing?.start_datetime) return localDateTimeInput(editing.start_datetime);
    if (defaultDate) {
      const d = new Date(defaultDate);
      d.setHours(18, 0, 0, 0);
      return localDateTimeInput(d.toISOString());
    }
    const d = new Date();
    d.setMinutes(0, 0, 0);
    return localDateTimeInput(d.toISOString());
  }
  function defaultDateOnly(): string {
    const d = defaultDate ?? new Date();
    return dayKey(d);
  }

  const [title, setTitle] = useState(editing?.title ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [category, setCategory] = useState<CalendarEventCategory>(
    editing?.category ?? "lesson"
  );
  const [coordinatorId, setCoordinatorId] = useState<string>(
    editing?.coordinator_id ?? ""
  );
  const [status, setStatus] = useState<CalendarEventStatus>(
    editing?.status ?? "active"
  );
  const [isRecurring, setIsRecurring] = useState(editing?.is_recurring ?? false);

  const [startDateTime, setStartDateTime] = useState(defaultStartDateTime());
  const [endDateTime, setEndDateTime] = useState(
    editing ? localDateTimeInput(editing.end_datetime) : ""
  );

  const [recurrenceDays, setRecurrenceDays] = useState<number>(
    editing?.recurrence_days ?? 0
  );
  const [startTime, setStartTime] = useState(
    formatTime(editing?.start_time ?? null) || "18:00"
  );
  const [endTime, setEndTime] = useState(
    formatTime(editing?.end_time ?? null) || ""
  );
  const [seasonStart, setSeasonStart] = useState(
    editing?.start_season_date ?? defaultDateOnly()
  );
  const [seasonEnd, setSeasonEnd] = useState(editing?.end_season_date ?? "");

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function toggleDay(bit: number) {
    setRecurrenceDays((prev) => prev ^ bit);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    if (!title.trim()) {
      setErr("Ο τίτλος είναι υποχρεωτικός.");
      return;
    }
    if (isRecurring) {
      if (recurrenceDays === 0) {
        setErr("Επιλέξτε τουλάχιστον μία ημέρα της εβδομάδας.");
        return;
      }
      if (!seasonStart || !seasonEnd) {
        setErr("Έναρξη και Λήξη Σεζόν είναι υποχρεωτικά.");
        return;
      }
      if (new Date(seasonStart) > new Date(seasonEnd)) {
        setErr("Η Έναρξη Σεζόν πρέπει να είναι πριν τη Λήξη.");
        return;
      }
      if (!startTime) {
        setErr("Ορίστε ώρα έναρξης.");
        return;
      }
    } else {
      if (!startDateTime) {
        setErr("Η ημερομηνία/ώρα έναρξης είναι υποχρεωτική.");
        return;
      }
    }

    const payload: CalendarEventInsert = {
      title: title.trim(),
      description: description.trim() || null,
      category,
      coordinator_id: coordinatorId || null,
      status,
      is_recurring: isRecurring,
      recurrence_pattern: isRecurring ? "weekly" : null,
      recurrence_days: isRecurring ? recurrenceDays : 0,
      start_time: isRecurring ? `${startTime}:00` : null,
      end_time: isRecurring && endTime ? `${endTime}:00` : null,
      start_season_date: isRecurring ? seasonStart : null,
      end_season_date: isRecurring ? seasonEnd : null,
      start_datetime: isRecurring
        ? null
        : new Date(startDateTime).toISOString(),
      end_datetime:
        !isRecurring && endDateTime
          ? new Date(endDateTime).toISOString()
          : null,
    };

    setSaving(true);
    try {
      await onSubmit(editing ? { ...payload, id: editing.id } : payload);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Σφάλμα αποθήκευσης.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={editing ? "Επεξεργασία" : "Νέα Καταχώρηση"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Τίτλος" required>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Περιγραφή">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className={inputClass}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Κατηγορία" required>
            <select
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as CalendarEventCategory)
              }
              className={inputClass}
            >
              <option value="lesson">{CATEGORY_LABEL.lesson}</option>
              <option value="event">{CATEGORY_LABEL.event}</option>
              <option value="meeting">{CATEGORY_LABEL.meeting}</option>
              <option value="other">{CATEGORY_LABEL.other}</option>
            </select>
          </Field>
          <Field label="Υπεύθυνος (Coordinator)">
            <CoordinatorPicker
              members={coordinators}
              value={coordinatorId}
              onChange={setCoordinatorId}
            />
          </Field>
        </div>

        <div className="rounded-lg border border-border p-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isRecurring}
              onChange={(e) => setIsRecurring(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            Επαναλαμβανόμενο (εβδομαδιαία σεζόν)
          </label>

          {isRecurring ? (
            <div className="mt-3 space-y-4">
              <div>
                <p className="mb-1 text-xs font-medium text-muted">
                  Ημέρες εβδομάδας
                </p>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map((w) => {
                    const active = (recurrenceDays & w.bit) !== 0;
                    return (
                      <button
                        key={w.bit}
                        type="button"
                        onClick={() => toggleDay(w.bit)}
                        className={
                          "rounded-full border px-3 py-1 text-xs transition " +
                          (active
                            ? "border-accent bg-accent/10 text-accent"
                            : "border-border hover:bg-background")
                        }
                      >
                        {active ? "✓ " : ""}
                        {w.short}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Έναρξη Σεζόν" required>
                  <input
                    type="date"
                    required
                    value={seasonStart}
                    onChange={(e) => setSeasonStart(e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Λήξη Σεζόν" required>
                  <input
                    type="date"
                    required
                    value={seasonEnd}
                    onChange={(e) => setSeasonEnd(e.target.value)}
                    className={inputClass}
                  />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Ώρα έναρξης" required>
                  <input
                    type="time"
                    required
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Ώρα λήξης">
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className={inputClass}
                  />
                </Field>
              </div>
            </div>
          ) : (
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field label="Έναρξη" required>
                <input
                  type="datetime-local"
                  required
                  value={startDateTime}
                  onChange={(e) => setStartDateTime(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Λήξη">
                <input
                  type="datetime-local"
                  value={endDateTime}
                  onChange={(e) => setEndDateTime(e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>
          )}
        </div>

        {editing && (
          <Field label="Κατάσταση">
            <select
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as CalendarEventStatus)
              }
              className={inputClass}
            >
              <option value="active">Ενεργό</option>
              <option value="cancelled">Ακυρωμένο</option>
            </select>
          </Field>
        )}

        {err && (
          <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
            {err}
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
    </Modal>
  );
}

function CoordinatorPicker({
  members,
  value,
  onChange,
}: {
  members: Member[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const selected = useMemo(
    () => members.find((m) => m.id === value) ?? null,
    [members, value]
  );

  const matches = useMemo(() => {
    const q = debounced.toLowerCase();
    if (!q) return members.slice(0, 8);
    return members
      .filter((m) =>
        `${m.last_name} ${m.first_name}`.toLowerCase().includes(q) ||
        `${m.first_name} ${m.last_name}`.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [members, debounced]);

  function pick(m: Member) {
    onChange(m.id);
    setSearch("");
    setDebounced("");
    setOpen(false);
  }

  function clear() {
    onChange("");
    setSearch("");
    setDebounced("");
    setOpen(false);
  }

  if (selected) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm">
        <span className="flex-1 truncate font-medium">
          {selected.last_name} {selected.first_name}
        </span>
        <button
          type="button"
          onClick={clear}
          aria-label="Καθαρισμός υπευθύνου"
          className="rounded-md border border-border px-2 py-0.5 text-xs text-muted transition hover:border-danger/50 hover:text-danger"
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Αναζήτηση υπεύθυνου..."
        className={inputClass}
      />
      {open && matches.length > 0 && (
        <ul className="absolute left-0 right-0 z-10 mt-1 max-h-60 overflow-y-auto rounded-lg border border-border bg-surface shadow-lg">
          {matches.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(m);
                }}
                className="block w-full px-3 py-2 text-left text-sm transition hover:bg-background"
              >
                <span className="font-medium">
                  {m.last_name} {m.first_name}
                </span>
                {m.department && (
                  <span className="ml-2 text-xs text-muted">
                    {m.department}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && debounced && matches.length === 0 && (
        <p className="absolute left-0 right-0 z-10 mt-1 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted shadow-lg">
          Δεν βρέθηκαν μέλη.
        </p>
      )}
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
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
        className="w-full max-w-2xl rounded-xl border border-border bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold">{title}</h2>
        {children}
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
