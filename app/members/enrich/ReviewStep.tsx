"use client";

// app/members/enrich/ReviewStep.tsx
//
// Step 3 — per-row decision review. Hosts ReviewCard, cursor navigation,
// + final commit handler. Per locked Q1: cursor advance is literal +1
// (no skip-decided).
//
// Commit flow: συγκεντρώνει όλες τις decisions, defaults undecided rows
// σε admin_skipped (plan §3.3 — "πάντα admin confirms"), POST σε
// /api/members/enrich/commit, dispatch COMMIT_DONE με το result.

import { useMemo, useState, type Dispatch } from "react";

import type {
  EnrichmentDecision,
  NormalizedExcelRow,
} from "@/lib/enrich/types";

import { ReviewCard } from "./ReviewCard";
import {
  type CommitResponse,
  type WizardAction,
  type WizardState,
} from "./_state";

type ReviewStateOnly = Extract<WizardState, { step: "review" }>;

type Props = {
  state: ReviewStateOnly;
  dispatch: Dispatch<WizardAction>;
};

export function ReviewStep({ state, dispatch }: Props) {
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);

  const total = state.normalizedRows.length;
  const decisionsCount = state.decisions.size;
  const remaining = Math.max(0, total - decisionsCount);

  const currentRow: NormalizedExcelRow | undefined = state.normalizedRows[state.cursor];
  const currentMatched = useMemo(
    () => state.perRow.find((r) => r.rowIndex === state.cursor),
    [state.perRow, state.cursor],
  );

  function handlePrev() {
    if (state.cursor > 0) {
      dispatch({ type: "SET_CURSOR", cursor: state.cursor - 1 });
    }
  }

  function handleNext() {
    if (state.cursor < total - 1) {
      dispatch({ type: "SET_CURSOR", cursor: state.cursor + 1 });
    }
  }

  async function handleCommit() {
    setCommitting(true);
    setCommitError(null);
    try {
      // Build decisions array: για κάθε row, εξήγαγε από decisions Map ή
      // default σε admin_skipped (plan §3.3 — "πάντα admin confirms").
      const decisions: EnrichmentDecision[] = state.normalizedRows.map((row) => {
        const existing = state.decisions.get(row.rowIndex);
        if (existing) return existing;
        return {
          kind: "skip",
          rowIndex: row.rowIndex,
          reason: "admin_skipped",
        };
      });

      const response = await fetch("/api/members/enrich/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisions, filename: state.filename }),
      });
      if (!response.ok) {
        const detail = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        setCommitError(detail?.error ?? `Αποτυχία (HTTP ${response.status}).`);
        return;
      }
      const data = (await response.json()) as CommitResponse;
      dispatch({ type: "COMMIT_DONE", result: data });
    } catch {
      setCommitError("Σφάλμα δικτύου — δοκίμασε ξανά.");
    } finally {
      setCommitting(false);
    }
  }

  if (!currentRow || !currentMatched) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-sm text-rose-600">
        Σφάλμα: η γραμμή δεν βρέθηκε (cursor {state.cursor} / {total}).
      </div>
    );
  }

  const onLastRow = state.cursor >= total - 1;

  return (
    <div className="space-y-4">
      {/* Progress header */}
      <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-border bg-surface p-3 text-sm">
        <span>
          Καρτέλα <strong>{state.cursor + 1}</strong> / {total}
        </span>
        <span className="text-xs text-muted">
          {decisionsCount} {decisionsCount === 1 ? "απόφαση" : "αποφάσεις"} ·{" "}
          {remaining} {remaining === 1 ? "εκκρεμεί" : "εκκρεμούν"}
        </span>
      </div>

      {/* The card — key forces remount per cursor for fresh initial state */}
      <ReviewCard
        key={state.cursor}
        rowIndex={state.cursor}
        normalizedRow={currentRow}
        candidates={currentMatched.candidates}
        allMembers={state.allMembers}
        decision={state.decisions.get(state.cursor)}
        onDecisionChange={(d) =>
          dispatch({
            type: "SET_DECISION",
            rowIndex: state.cursor,
            decision: d,
          })
        }
      />

      {commitError && <p className="text-sm text-rose-600">{commitError}</p>}

      {/* Footer */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface p-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handlePrev}
            disabled={state.cursor === 0 || committing}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm transition hover:bg-background disabled:opacity-50"
          >
            ← Προηγούμενο
          </button>
          <button
            type="button"
            onClick={handleNext}
            disabled={onLastRow || committing}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm transition hover:bg-background disabled:opacity-50"
          >
            Επόμενο ⏭
          </button>
        </div>

        <button
          type="button"
          onClick={handleCommit}
          disabled={committing}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
        >
          {committing ? "Commit…" : "💾 Commit όλα"}
        </button>
      </div>
    </div>
  );
}
