"use client";

import { useEffect, useMemo, useState } from "react";
import { errorMessage, getBrowserClient } from "@/lib/supabase/client";
import type {
  ContributionType,
  EventSponsor,
  EventSponsorInsert,
  Sponsor,
} from "@/lib/supabase/types";
import { formatEuro } from "@/lib/utils/eventRevenue";

// ── Types ────────────────────────────────────────────────────

type SponsorRow = {
  id?: string;
  sponsor_id: string;
  display_name: string;
  contribution_type: ContributionType;
  contribution_value: string;
  contribution_description: string;
  is_received: boolean;
  received_at: string;
};

type EventSponsorWithSponsor = EventSponsor & {
  sponsor: {
    external_name: string | null;
    member: { first_name: string | null; last_name: string | null } | null;
  } | null;
};

type SponsorWithMember = Sponsor & {
  member: { first_name: string | null; last_name: string | null } | null;
};

// ── Helpers ──────────────────────────────────────────────────

const CONTRIBUTION_TYPE_LABELS: Record<ContributionType, string> = {
  money: "Χρήματα",
  product: "Προϊόν",
  service: "Υπηρεσία",
  venue: "Χώρος",
  other: "Άλλο",
};

const CONTRIBUTION_OPTIONS: Array<{ value: ContributionType; label: string }> =
  [
    { value: "money", label: "Χρήματα" },
    { value: "product", label: "Προϊόν" },
    { value: "service", label: "Υπηρεσία" },
    { value: "venue", label: "Χώρος" },
    { value: "other", label: "Άλλο" },
  ];

const inputClass =
  "rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

function sponsorListName(s: SponsorWithMember): string {
  if (s.member) {
    const name = [s.member.last_name, s.member.first_name]
      .filter(Boolean)
      .join(" ");
    if (name) return name;
  }
  return s.external_name ?? "—";
}

function sponsorDisplayName(s: EventSponsorWithSponsor): string {
  if (s.sponsor?.member) {
    const { last_name, first_name } = s.sponsor.member;
    const name = [last_name, first_name].filter(Boolean).join(" ");
    if (name) return name;
  }
  return s.sponsor?.external_name ?? "—";
}

function toRow(s: EventSponsorWithSponsor): SponsorRow {
  return {
    id: s.id,
    sponsor_id: s.sponsor_id,
    display_name: sponsorDisplayName(s),
    contribution_type: s.contribution_type,
    contribution_value:
      s.contribution_value != null ? String(s.contribution_value) : "",
    contribution_description: s.contribution_description ?? "",
    is_received: s.received_at !== null,
    received_at: s.received_at ? s.received_at.slice(0, 10) : "",
  };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Main component ───────────────────────────────────────────

export default function SponsorsPanel({
  eventId,
  clubId,
  onSponsorsChange,
}: {
  eventId: string;
  clubId: string;
  onSponsorsChange?: (sponsors: EventSponsor[]) => void;
}) {
  const [rows, setRows] = useState<SponsorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);

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
        const { data, error: qErr } = await supabase
          .from("event_sponsors")
          .select(
            "*, sponsor:sponsor_id(external_name, member:member_id(first_name, last_name))"
          )
          .eq("event_id", eventId)
          .order("created_at", { ascending: true });
        if (cancelled) return;
        if (qErr) throw qErr;
        setRows(
          ((data ?? []) as unknown as EventSponsorWithSponsor[]).map(toRow)
        );
      } catch (err) {
        if (!cancelled)
          setError(errorMessage(err, "Σφάλμα φόρτωσης χορηγιών."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [eventId, clubId]);

  // ── Row helpers ───────────────────────────────────────────

  function updateRow(idx: number, patch: Partial<SponsorRow>) {
    setRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, ...patch } : r))
    );
  }

  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleAddSponsor(newRow: {
    sponsor_id: string;
    display_name: string;
    contribution_type: ContributionType;
    contribution_value: string;
    contribution_description: string;
  }) {
    setRows((prev) => [
      ...prev,
      { ...newRow, is_received: false, received_at: "" },
    ]);
    setShowAddDialog(false);
  }

  // ── Summary (money only) ──────────────────────────────────

  const summary = useMemo(() => {
    let pledged = 0;
    let received = 0;
    for (const r of rows) {
      if (r.contribution_type !== "money") continue;
      const n = Number(r.contribution_value.replace(",", ".")) || 0;
      if (r.is_received) received += n;
      else pledged += n;
    }
    return { pledged, received, total: pledged + received };
  }, [rows]);

  // ── Save ──────────────────────────────────────────────────

  async function handleSave() {
    for (const r of rows) {
      if (r.is_received && !r.received_at) {
        setSaveError(
          `Επιλέξτε ημερομηνία είσπραξης για τον χορηγό "${r.display_name}".`
        );
        return;
      }
      if (
        r.contribution_type === "money" &&
        r.is_received &&
        (r.contribution_value === "" ||
          Number(r.contribution_value.replace(",", ".")) <= 0)
      ) {
        setSaveError(
          `Συμπληρώστε αξία > 0 για εισπραγμένο χορηγό "${r.display_name}".`
        );
        return;
      }
    }

    setSaving(true);
    setSaveError(null);

    try {
      const supabase = getBrowserClient();

      const { error: delErr } = await supabase
        .from("event_sponsors")
        .delete()
        .eq("event_id", eventId);
      if (delErr) throw delErr;

      let refreshed: SponsorRow[] = [];
      if (rows.length > 0) {
        const toInsert: EventSponsorInsert[] = rows.map((r) => ({
          event_id: eventId,
          club_id: clubId,
          sponsor_id: r.sponsor_id,
          contribution_type: r.contribution_type,
          contribution_value:
            r.contribution_type === "money" && r.contribution_value !== ""
              ? Number(r.contribution_value.replace(",", ".")) || null
              : null,
          contribution_description:
            r.contribution_description.trim() || null,
          received_at:
            r.is_received && r.received_at ? r.received_at : null,
        }));

        const { data: ins, error: insErr } = await supabase
          .from("event_sponsors")
          .insert(toInsert)
          .select(
            "*, sponsor:sponsor_id(external_name, member:member_id(first_name, last_name))"
          );
        if (insErr) throw insErr;

        const inserted = (
          ins ?? []
        ) as unknown as EventSponsorWithSponsor[];
        onSponsorsChange?.(inserted as unknown as EventSponsor[]);
        refreshed = inserted.map(toRow);
      } else {
        onSponsorsChange?.([]);
      }

      setRows(refreshed);
    } catch (err) {
      setSaveError(errorMessage(err, "Σφάλμα αποθήκευσης χορηγιών."));
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

  const hasMoneyRows = rows.some((r) => r.contribution_type === "money");

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
            🤝 Χορηγίες Εκδήλωσης
          </h2>
          {hasMoneyRows && (
            <p className="text-xs text-muted">
              Δεσμευμένες:{" "}
              <span className="font-medium text-foreground">
                {formatEuro(summary.pledged)}
              </span>{" "}
              • Εισπραχθείσες:{" "}
              <span className="text-emerald-600 dark:text-emerald-400">
                {formatEuro(summary.received)}
              </span>
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowAddDialog(true)}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90"
        >
          + Προσθήκη Χορηγίας
        </button>
      </div>

      {/* Empty state */}
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted">
          Δεν υπάρχουν χορηγοί ακόμα.
        </p>
      ) : (
        <div className="overflow-x-auto overflow-hidden rounded-lg border border-border">
          <table className="w-full table-fixed text-sm">
            <thead className="border-b border-border bg-background/50 text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="w-[28%] px-3 py-2 text-left">Χορηγός</th>
                <th className="w-[12%] px-3 py-2 text-right">Αξία €</th>
                <th className="w-[28%] px-3 py-2 text-left">Περιγραφή</th>
                <th className="w-[27%] px-3 py-2 text-left">Εισπράχθηκε</th>
                <th className="w-[5%] px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r, i) => (
                <tr key={i} className="bg-background">
                  {/* Χορηγός (read-only) */}
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-medium">
                        {r.display_name}
                      </span>
                      <span className="whitespace-nowrap rounded-full bg-foreground/10 px-1.5 py-0.5 text-[10px] text-foreground/70">
                        {CONTRIBUTION_TYPE_LABELS[r.contribution_type]}
                      </span>
                    </div>
                  </td>

                  {/* Αξία */}
                  <td className="px-3 py-2">
                    {r.contribution_type === "money" ? (
                      <input
                        type="number"
                        step="0.01"
                        min={0}
                        inputMode="decimal"
                        value={r.contribution_value}
                        onChange={(ev) =>
                          updateRow(i, { contribution_value: ev.target.value })
                        }
                        placeholder="0.00"
                        className={inputClass + " w-full text-right"}
                      />
                    ) : (
                      <input
                        type="text"
                        value="—"
                        disabled
                        className={inputClass + " w-full text-right text-muted/60 cursor-not-allowed"}
                        tabIndex={-1}
                        aria-label="Δεν εφαρμόζεται"
                      />
                    )}
                  </td>

                  {/* Περιγραφή */}
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={r.contribution_description}
                      onChange={(ev) =>
                        updateRow(i, {
                          contribution_description: ev.target.value,
                        })
                      }
                      placeholder="π.χ. 10 μπουκάλια κρασί"
                      maxLength={100}
                      className={inputClass + " w-full"}
                    />
                  </td>

                  {/* Εισπράχθηκε */}
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={r.is_received}
                        onChange={(ev) =>
                          updateRow(i, {
                            is_received: ev.target.checked,
                            received_at: ev.target.checked ? today() : "",
                          })
                        }
                        className="accent-accent"
                      />
                      {r.is_received && (
                        <input
                          type="date"
                          value={r.received_at}
                          max={today()}
                          onChange={(ev) =>
                            updateRow(i, { received_at: ev.target.value })
                          }
                          className={inputClass + " w-full"}
                        />
                      )}
                    </div>
                  </td>

                  {/* Delete */}
                  <td className="px-3 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      title="Αφαίρεση χορηγού"
                      aria-label="Αφαίρεση"
                      className="rounded p-1 text-danger hover:bg-danger/10"
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

      {/* Summary footer (money rows only) */}
      {hasMoneyRows && (
        <div className="rounded-lg border border-border bg-background/50 px-4 py-3 text-xs">
          <div className="flex justify-between">
            <span className="text-muted">Εισπραχθείσες</span>
            <span className="font-medium text-emerald-600 dark:text-emerald-400">
              {formatEuro(summary.received)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Δεσμευμένες</span>
            <span
              className={
                "font-medium " +
                (summary.pledged > 0
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-muted")
              }
            >
              {formatEuro(summary.pledged)}
            </span>
          </div>
          <div className="mt-1.5 flex justify-between border-t border-border pt-1.5">
            <span className="font-medium">Σύνολο Χρηματικών</span>
            <span className="font-semibold">{formatEuro(summary.total)}</span>
          </div>
        </div>
      )}

      {/* Note */}
      {rows.length > 0 && (
        <p className="text-xs italic text-muted">
          Εισπραχθείσες χορηγίες χρημάτων μπορούν να συμπεριληφθούν στα
          Έσοδα.
        </p>
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
      {rows.length > 0 && (
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
      )}

      {/* Add dialog */}
      {showAddDialog && (
        <AddSponsorshipDialog
          clubId={clubId}
          linkedSponsorIds={new Set(rows.map((r) => r.sponsor_id))}
          onClose={() => setShowAddDialog(false)}
          onAdd={handleAddSponsor}
        />
      )}
    </div>
  );
}

// ── AddSponsorshipDialog ──────────────────────────────────────

type AddRow = {
  sponsor_id: string;
  display_name: string;
  contribution_type: ContributionType;
  contribution_value: string;
  contribution_description: string;
};

function AddSponsorshipDialog({
  clubId,
  linkedSponsorIds,
  onClose,
  onAdd,
}: {
  clubId: string;
  linkedSponsorIds: Set<string>;
  onClose: () => void;
  onAdd: (row: AddRow) => void;
}) {
  const [allSponsors, setAllSponsors] = useState<SponsorWithMember[]>([]);
  const [sponsorsLoading, setSponsorsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSponsorId, setSelectedSponsorId] = useState("");
  const [contribType, setContribType] = useState<ContributionType>("money");
  const [contribValue, setContribValue] = useState("");
  const [contribDesc, setContribDesc] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = getBrowserClient();
        const { data, error } = await supabase
          .from("sponsors")
          .select("*, member:member_id(first_name, last_name)")
          .eq("club_id", clubId)
          .order("external_name", { ascending: true, nullsFirst: false });
        if (cancelled) return;
        if (!error) setAllSponsors((data ?? []) as unknown as SponsorWithMember[]);
      } finally {
        if (!cancelled) setSponsorsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [clubId]);

  const availableSponsors = useMemo(
    () => allSponsors.filter((s) => !linkedSponsorIds.has(s.id)),
    [allSponsors, linkedSponsorIds]
  );

  const filteredSponsors = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return availableSponsors;
    return availableSponsors.filter((s) =>
      sponsorListName(s).toLowerCase().includes(q)
    );
  }, [availableSponsors, searchQuery]);

  function submit() {
    setErr(null);
    if (!selectedSponsorId) {
      setErr("Επιλέξτε χορηγό.");
      return;
    }
    const selected = availableSponsors.find((s) => s.id === selectedSponsorId);
    if (!selected) return;
    onAdd({
      sponsor_id: selected.id,
      display_name: sponsorListName(selected),
      contribution_type: contribType,
      contribution_value: contribValue,
      contribution_description: contribDesc,
    });
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-xl border border-border bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-border p-5">
          <h3 className="text-base font-semibold">Προσθήκη Χορηγίας</h3>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {/* Sponsor picker */}
          <div>
            <span className="mb-1 block text-xs font-medium text-muted">
              Χορηγός
            </span>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Αναζήτηση χορηγού…"
              className={inputClass + " mb-2 w-full"}
            />
            {sponsorsLoading ? (
              <p className="py-3 text-center text-xs text-muted">Φόρτωση…</p>
            ) : allSponsors.length === 0 ? (
              <div className="rounded-lg border border-border p-6 text-center">
                <p className="text-sm">Δεν υπάρχουν χορηγοί καταχωρημένοι.</p>
                <p className="mt-2 text-xs text-muted">
                  Δημιουργήστε πρώτα χορηγό από το tab &ldquo;Χορηγοί&rdquo; στα Οικονομικά.
                </p>
              </div>
            ) : (
              <ul className="max-h-60 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                {filteredSponsors.length === 0 ? (
                  <li className="p-3 text-center text-sm text-muted">
                    Δεν βρέθηκε χορηγός. Δημιουργήστε νέο από το tab &ldquo;Χορηγοί&rdquo; στα Οικονομικά.
                  </li>
                ) : (
                  filteredSponsors.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedSponsorId(s.id)}
                        className={
                          "flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm transition " +
                          (selectedSponsorId === s.id
                            ? "bg-accent/10 text-accent"
                            : "hover:bg-foreground/5")
                        }
                      >
                        <span className="truncate font-medium">
                          {sponsorListName(s)}
                        </span>
                        <span
                          className={
                            "whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] " +
                            (s.member_id
                              ? "bg-blue-500/10 text-blue-700 dark:text-blue-300"
                              : "bg-amber-500/10 text-amber-700 dark:text-amber-300")
                          }
                        >
                          {s.member_id ? "Μέλος" : "Εξωτερικός"}
                        </span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>

          {/* Contribution */}
          <fieldset className="space-y-3 rounded-lg border border-border p-3">
            <legend className="px-2 text-xs font-semibold uppercase tracking-wider text-muted">
              Προσφορά
            </legend>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">
                  Είδος
                </span>
                <select
                  value={contribType}
                  onChange={(e) =>
                    setContribType(e.target.value as ContributionType)
                  }
                  className={inputClass + " w-full"}
                >
                  {CONTRIBUTION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">
                  Αξία (€)
                </span>
                <input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={contribValue}
                  onChange={(e) => setContribValue(e.target.value)}
                  placeholder="0.00"
                  className={inputClass + " w-full"}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">
                  Περιγραφή
                </span>
                <input
                  type="text"
                  value={contribDesc}
                  onChange={(e) => setContribDesc(e.target.value)}
                  placeholder="π.χ. 10 μπουκάλια κρασί"
                  className={inputClass + " w-full"}
                />
              </label>
            </div>
          </fieldset>

          {err && (
            <p className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
              {err}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-border p-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm transition hover:bg-foreground/5"
          >
            Ακύρωση
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!selectedSponsorId}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
          >
            Προσθήκη
          </button>
        </div>
      </div>
    </div>
  );
}
