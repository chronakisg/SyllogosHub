"use client";

// app/members/enrich/ReviewCard.tsx
//
// Per-row review card — η καρδιά του wizard (plan §3 Step 3 mockup).
// Local state machine με 3 modes (candidate / manual / skip),
// auto-tick logic για empty-existing fields, και manual member search.
//
// Architecture notes:
// - NO useEffect. State updates propagate σε parent μέσω direct callback
//   στους event handlers (React 19 anti-patterns / locked decision Q5).
// - Lazy useState init: ένα single function computes BOTH selection +
//   fieldTicks από existing decision OR auto-detection on mount.
// - "key={cursor}" στο ReviewStep forces remount when admin navigates →
//   fresh initial state per row.
// - Auto-decisions για primary-tier matches (score ≥ 50, με ≥1 empty-existing
//   field προς fill) έρχονται PRE-POPULATED από reducer
//   (lib/enrich/autoDecision.ts → MATCH_LOADED case). Αυτό το component
//   απλά reflects + edits το decision prop. Rows χωρίς auto-decision
//   ξεκινούν undecided — admin πρέπει να engage-αρει για να καταγραφεί
//   decision (handleCommit defaults undecided σε admin_skipped).
// - computeAutoTicks παραμένει εδώ για mid-review member-change recompute
//   (όταν admin εναλλάσσει candidate radio → fresh ticks for new member).

import { useMemo, useState } from "react";

import { MEMBER_FIELD_LABELS } from "@/lib/audit/labels";
import {
  MATCH_THRESHOLD_PRIMARY,
  type MatchableMember,
} from "@/lib/enrich/match";
import {
  ENRICH_FIELDS,
  type EnrichField,
  type EnrichmentDecision,
  type MatchCandidate,
  type MatchSignal,
  type NormalizedExcelRow,
  type SkipReason,
} from "@/lib/enrich/types";
import { normalizeGreek } from "@/lib/utils/greekSearch";

// ──────────────────────────────────────────────────────────────────
// Constants — UI labels for match signals
// ──────────────────────────────────────────────────────────────────

const SIGNAL_LABELS: Record<MatchSignal, string> = {
  email_exact: "✉ Email",
  phone_exact: "📞 Τηλέφωνο",
  lastname_exact: "👤 Επώνυμο",
  firstname_exact: "👤 Όνομα",
  firstname_fuzzy: "👤 Όνομα ~",
  father_name_exact: "👨 Πατρώνυμο",
  address_overlap: "🏠 Διεύθυνση",
};

// ──────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────

type CardSelection =
  | { mode: "candidate"; memberId: string }
  | { mode: "manual"; memberId: string | null }
  | { mode: "skip"; reason: SkipReason };

type FieldTicks = Partial<Record<EnrichField, boolean>>;

type Props = {
  rowIndex: number;
  normalizedRow: NormalizedExcelRow;
  candidates: MatchCandidate[];
  allMembers: MatchableMember[];
  decision: EnrichmentDecision | undefined;
  onDecisionChange: (d: EnrichmentDecision) => void;
};

// ──────────────────────────────────────────────────────────────────
// Helpers (pure)
// ──────────────────────────────────────────────────────────────────

function findMember(
  memberId: string | null,
  allMembers: MatchableMember[],
): MatchableMember | null {
  if (!memberId) return null;
  return allMembers.find((m) => m.id === memberId) ?? null;
}

function getMemberId(sel: CardSelection): string | null {
  return sel.mode === "skip" ? null : sel.memberId;
}

/**
 * Auto-tick rule (plan §3 mockup + locked Q2):
 *   - Excel value non-empty
 *   - Existing member value is null/empty
 * Email subsumed από rule #2: αν existing non-empty, ΔΕΝ τικάρει.
 */
function computeAutoTicks(
  member: MatchableMember | null,
  row: NormalizedExcelRow,
): FieldTicks {
  if (!member) return {};
  const ticks: FieldTicks = {};
  const memberRec = member as unknown as Record<string, unknown>;
  for (const field of ENRICH_FIELDS) {
    const excelValue = row.values[field];
    if (excelValue === null || excelValue === undefined || excelValue === "") {
      continue;
    }
    const existing = memberRec[field];
    if (existing !== null && existing !== undefined && existing !== "") {
      continue;
    }
    ticks[field] = true;
  }
  return ticks;
}

function deriveTicksFromUpdates(
  updates: Partial<Record<EnrichField, string | null>>,
): FieldTicks {
  const ticks: FieldTicks = {};
  for (const field of ENRICH_FIELDS) {
    if (field in updates) ticks[field] = true;
  }
  return ticks;
}

/**
 * State → EnrichmentDecision. Returns null για incomplete state
 * (πχ manual mode χωρίς picked member). Caller πρέπει να skip-arei
 * το dispatch όταν επιστρέφεται null.
 */
function buildDecision(
  selection: CardSelection,
  fieldTicks: FieldTicks,
  rowIndex: number,
  row: NormalizedExcelRow,
): EnrichmentDecision | null {
  if (selection.mode === "skip") {
    return { kind: "skip", rowIndex, reason: selection.reason };
  }
  if (selection.mode === "manual" && selection.memberId === null) {
    return null;
  }
  const memberId =
    selection.mode === "candidate" ? selection.memberId : selection.memberId;
  if (!memberId) return null;
  const fieldUpdates: Partial<Record<EnrichField, string | null>> = {};
  for (const field of ENRICH_FIELDS) {
    if (!fieldTicks[field]) continue;
    const v = row.values[field];
    fieldUpdates[field] = v ?? null;
  }
  return { kind: "apply", rowIndex, memberId, fieldUpdates };
}

/**
 * Lazy initial state: existing decision OR auto-detection για first land.
 * Καλείται μία φορά από useState — `key={cursor}` στο parent forces
 * remount όταν admin πλοηγείται, οπότε per-row fresh computation.
 */
function computeInitialState(props: Props): {
  selection: CardSelection;
  fieldTicks: FieldTicks;
} {
  const { decision, candidates, allMembers, normalizedRow } = props;

  if (decision) {
    if (decision.kind === "apply") {
      const inCandidates = candidates.some(
        (c) => c.memberId === decision.memberId,
      );
      const selection: CardSelection = inCandidates
        ? { mode: "candidate", memberId: decision.memberId }
        : { mode: "manual", memberId: decision.memberId };
      return {
        selection,
        fieldTicks: deriveTicksFromUpdates(decision.fieldUpdates),
      };
    }
    return {
      selection: { mode: "skip", reason: decision.reason },
      fieldTicks: {},
    };
  }

  // First land: αυτο-επιλογή primary candidate αν score ≥ 50
  const primary = candidates[0];
  if (primary && primary.score >= MATCH_THRESHOLD_PRIMARY) {
    const member = findMember(primary.memberId, allMembers);
    return {
      selection: { mode: "candidate", memberId: primary.memberId },
      fieldTicks: computeAutoTicks(member, normalizedRow),
    };
  }

  // Fallback: no primary candidate → UI shows skip(no_match).
  // ΣΗΜΕΙΩΣΗ: ΔΕΝ dispatch-άρουμε αυτή την state σε parent — αν admin
  // δεν αλληλεπιδράσει, handleCommit defaults σε admin_skipped.
  return {
    selection: { mode: "skip", reason: "no_match" },
    fieldTicks: {},
  };
}

// ──────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────

export function ReviewCard(props: Props) {
  const { rowIndex, normalizedRow, candidates, allMembers, onDecisionChange } =
    props;

  const [initial] = useState(() => computeInitialState(props));
  const [selection, setSelection] = useState<CardSelection>(initial.selection);
  const [fieldTicks, setFieldTicks] = useState<FieldTicks>(initial.fieldTicks);
  const [manualSearchQuery, setManualSearchQuery] = useState("");

  const selectedMember = useMemo(
    () => findMember(getMemberId(selection), allMembers),
    [selection, allMembers],
  );

  const filteredMembers = useMemo(() => {
    const q = manualSearchQuery.trim();
    if (q === "") return [];
    const nq = normalizeGreek(q);
    return allMembers
      .filter((m) =>
        normalizeGreek(`${m.last_name ?? ""} ${m.first_name ?? ""}`).includes(
          nq,
        ),
      )
      .slice(0, 10);
  }, [manualSearchQuery, allMembers]);

  // ────────────────────────────────────────────────────────────────
  // Event handlers (direct dispatch propagation, NO useEffect)
  // ────────────────────────────────────────────────────────────────

  function setSelectionAndPropagate(newSel: CardSelection) {
    const oldMemberId = getMemberId(selection);
    const newMemberId = getMemberId(newSel);

    let nextTicks: FieldTicks = fieldTicks;
    if (newSel.mode === "skip") {
      nextTicks = {};
      setFieldTicks(nextTicks);
    } else if (newMemberId !== oldMemberId) {
      const member = findMember(newMemberId, allMembers);
      nextTicks = computeAutoTicks(member, normalizedRow);
      setFieldTicks(nextTicks);
    }

    setSelection(newSel);

    const next = buildDecision(newSel, nextTicks, rowIndex, normalizedRow);
    if (next) onDecisionChange(next);
  }

  function toggleField(field: EnrichField) {
    const nextTicks: FieldTicks = { ...fieldTicks, [field]: !fieldTicks[field] };
    setFieldTicks(nextTicks);
    const next = buildDecision(selection, nextTicks, rowIndex, normalizedRow);
    if (next) onDecisionChange(next);
  }

  // ────────────────────────────────────────────────────────────────
  // Derived display
  // ────────────────────────────────────────────────────────────────

  const isCandidateSelected = (memberId: string): boolean =>
    selection.mode === "candidate" && selection.memberId === memberId;

  const isManualSelected = selection.mode === "manual";
  const isSkipSelected = selection.mode === "skip";

  return (
    <div className="space-y-4">
      {/* Excel data card */}
      <div className="rounded-lg border border-border bg-surface p-4">
        <header className="mb-2 text-xs text-muted">
          Δεδομένα Excel (row {rowIndex + 1})
        </header>
        <ExcelDataDisplay row={normalizedRow} />
      </div>

      {/* Candidates + manual + skip radio group */}
      <fieldset className="rounded-lg border border-border bg-surface p-4">
        <legend className="px-1 text-sm font-semibold">
          Πιθανά matches
        </legend>

        {candidates.length === 0 && (
          <p className="mb-3 text-sm text-muted">
            Δεν βρέθηκε κανένα ταιριαστό μέλος από auto-match.
          </p>
        )}

        {candidates.slice(0, 3).map((c) => {
          const member = findMember(c.memberId, allMembers);
          if (!member) return null;
          const checked = isCandidateSelected(c.memberId);
          return (
            <label
              key={c.memberId}
              className={`mb-2 flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition ${
                checked
                  ? "border-accent bg-accent/5"
                  : "border-border hover:bg-background"
              }`}
            >
              <input
                type="radio"
                name={`row-${rowIndex}-selection`}
                checked={checked}
                onChange={() =>
                  setSelectionAndPropagate({
                    mode: "candidate",
                    memberId: c.memberId,
                  })
                }
                className="mt-1"
              />
              <div className="flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">
                    {member.last_name} {member.first_name}
                  </span>
                  <span className="text-xs text-muted">score {c.score}</span>
                </div>
                {c.signals.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {c.signals.map((sig) => (
                      <span
                        key={sig}
                        className="inline-flex items-center rounded-full bg-background px-2 py-0.5 text-xs text-muted"
                      >
                        {SIGNAL_LABELS[sig]}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-1 grid grid-cols-1 gap-x-3 gap-y-0.5 text-xs text-muted sm:grid-cols-2">
                  <span>📞 {member.phone ?? "(κενό)"}</span>
                  <span>📧 {member.email ?? "(κενό)"}</span>
                  <span className="sm:col-span-2">
                    🏠 {member.address ?? "(κενό)"}
                  </span>
                </div>
              </div>
            </label>
          );
        })}

        <label
          className={`mb-2 flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition ${
            isManualSelected
              ? "border-accent bg-accent/5"
              : "border-border hover:bg-background"
          }`}
        >
          <input
            type="radio"
            name={`row-${rowIndex}-selection`}
            checked={isManualSelected}
            onChange={() =>
              setSelectionAndPropagate({ mode: "manual", memberId: null })
            }
            className="mt-1"
          />
          <div className="flex-1">
            <span className="font-medium">Άλλος (ψάξε στο μητρώο…)</span>
          </div>
        </label>

        {isManualSelected && (
          <div className="mb-3 ml-7 space-y-2">
            <input
              type="search"
              value={manualSearchQuery}
              onChange={(e) => setManualSearchQuery(e.target.value)}
              placeholder="Αναζήτηση μέλους (Επώνυμο Όνομα)…"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            {manualSearchQuery.trim() === "" ? (
              <p className="text-xs text-muted">
                Πληκτρολόγησε για αναζήτηση.
              </p>
            ) : filteredMembers.length === 0 ? (
              <p className="text-xs text-muted">Κανένα αποτέλεσμα.</p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border bg-background">
                {filteredMembers.map((m) => {
                  const picked =
                    selection.mode === "manual" && selection.memberId === m.id;
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() =>
                          setSelectionAndPropagate({
                            mode: "manual",
                            memberId: m.id,
                          })
                        }
                        className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition hover:bg-surface ${
                          picked ? "font-semibold text-accent" : ""
                        }`}
                      >
                        <span>
                          {m.last_name} {m.first_name}
                        </span>
                        {picked && <span className="text-xs">✓ επιλεγμένο</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        <label
          className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition ${
            isSkipSelected
              ? "border-accent bg-accent/5"
              : "border-border hover:bg-background"
          }`}
        >
          <input
            type="radio"
            name={`row-${rowIndex}-selection`}
            checked={isSkipSelected}
            onChange={() =>
              setSelectionAndPropagate({
                mode: "skip",
                reason: "admin_skipped",
              })
            }
            className="mt-1"
          />
          <div className="flex-1">
            <span className="font-medium">Skip — δεν είναι κανείς από αυτούς</span>
            <p className="mt-0.5 text-xs text-muted">
              Η γραμμή θα προστεθεί στο CSV για manual import αργότερα.
            </p>
          </div>
        </label>
      </fieldset>

      {/* Field diff panel */}
      {selectedMember && selection.mode !== "skip" && (
        <FieldDiffPanel
          member={selectedMember}
          row={normalizedRow}
          fieldTicks={fieldTicks}
          onToggle={toggleField}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────────

function ExcelDataDisplay({ row }: { row: NormalizedExcelRow }) {
  const last = row.values.last_name ?? "";
  const first = row.values.first_name ?? "";
  const fullName = [last, first].filter(Boolean).join(", ");
  return (
    <div>
      {fullName && (
        <div className="text-base font-semibold">{fullName}</div>
      )}
      <div className="mt-2 grid grid-cols-1 gap-x-3 gap-y-1 text-sm text-muted sm:grid-cols-2">
        {row.phones.length > 0 && (
          <span className="sm:col-span-2">
            📞 {row.phones.join(" / ")}
          </span>
        )}
        {row.values.email && <span>📧 {row.values.email}</span>}
        {row.values.address && <span>🏠 {row.values.address}</span>}
        {row.values.birth_date && <span>🎂 {row.values.birth_date}</span>}
        {row.values.occupation && <span>💼 {row.values.occupation}</span>}
      </div>
    </div>
  );
}

function FieldDiffPanel({
  member,
  row,
  fieldTicks,
  onToggle,
}: {
  member: MatchableMember;
  row: NormalizedExcelRow;
  fieldTicks: FieldTicks;
  onToggle: (field: EnrichField) => void;
}) {
  const memberRec = member as unknown as Record<string, unknown>;
  const rows = ENRICH_FIELDS.filter((field) => {
    const v = row.values[field];
    if (v === null || v === undefined || v === "") return false;
    const existing = memberRec[field];
    if (existing === v) return false; // hide no-op (excel value identical to existing)
    return true;
  });

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4 text-sm text-muted">
        Δεν υπάρχουν νέα στοιχεία για ενημέρωση από το Excel.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <header className="mb-2 text-sm font-semibold">
        Τι θα ενημερωθεί
      </header>
      <ul className="space-y-2">
        {rows.map((field) => {
          const excelValue = row.values[field] ?? "";
          const existing = memberRec[field];
          const existingStr =
            existing === null || existing === undefined || existing === ""
              ? "(κενό)"
              : String(existing);
          const isEmail = field === "email";
          const emailLocked =
            isEmail &&
            existing !== null &&
            existing !== undefined &&
            existing !== "";
          const checked = fieldTicks[field] === true;
          const label = MEMBER_FIELD_LABELS[field] ?? field;

          return (
            <li key={field} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={checked}
                disabled={emailLocked}
                onChange={() => onToggle(field)}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium">{label}:</span>
                  <span className="text-muted">{existingStr}</span>
                  <span className="text-muted">→</span>
                  <span>{String(excelValue)}</span>
                </div>
                {emailLocked && (
                  <p className="mt-0.5 text-xs text-muted">
                    🔒 Αλλαγή email απαιτεί re-verification — από το /members
                    modal.
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
