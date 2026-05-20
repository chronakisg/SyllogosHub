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
  computeVisibleIndices,
  type CommitResponse,
  type WizardAction,
  type WizardState,
} from "./_state";

function filterButtonClass(active: boolean): string {
  return `rounded-md px-3 py-1 transition ${
    active ? "bg-accent text-white font-medium" : "hover:bg-background"
  }`;
}

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

  // Visible row indices τρέχουν μόνο όταν αλλάζει το dataset (length),
  // το decisions Map (νέο reference per dispatch), ή το active filter.
  // Cursor moves δεν επηρεάζουν computation — narrow deps intentional.
  const visibleIndices = useMemo(
    () => computeVisibleIndices(state, state.filter),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.normalizedRows.length, state.decisions, state.filter],
  );

  function handlePrev() {
    const currentIdx = visibleIndices.indexOf(state.cursor);
    if (currentIdx > 0) {
      const prevCursor = visibleIndices[currentIdx - 1];
      dispatch({ type: "SET_CURSOR", cursor: prevCursor });
    }
  }

  function handleNext() {
    const currentIdx = visibleIndices.indexOf(state.cursor);
    if (currentIdx >= 0 && currentIdx < visibleIndices.length - 1) {
      const nextCursor = visibleIndices[currentIdx + 1];
      dispatch({ type: "SET_CURSOR", cursor: nextCursor });
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

  const isFirstVisible =
    visibleIndices.length === 0 || visibleIndices[0] === state.cursor;
  const isLastVisible =
    visibleIndices.length === 0 ||
    visibleIndices[visibleIndices.length - 1] === state.cursor;

  const visiblePosition = visibleIndices.indexOf(state.cursor) + 1;
  const visibleTotal = visibleIndices.length;
  const displayPosition = visiblePosition > 0 ? visiblePosition : 0;

  return (
    <div className="space-y-4">
      {/* Progress header + filter toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface p-3 text-sm">
        <span>
          Καρτέλα <strong>{displayPosition}</strong> / {visibleTotal}
        </span>
        <div className="flex gap-1 rounded-lg border border-border p-1">
          <button
            type="button"
            onClick={() => dispatch({ type: "SET_FILTER", filter: "all" })}
            className={filterButtonClass(state.filter === "all")}
          >
            Όλες ({total})
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: "SET_FILTER", filter: "decided" })}
            className={filterButtonClass(state.filter === "decided")}
          >
            Αποφάσεις ({decisionsCount})
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: "SET_FILTER", filter: "pending" })}
            className={filterButtonClass(state.filter === "pending")}
          >
            Εκκρεμότητες ({remaining})
          </button>
        </div>
      </div>

      {/* The card — key forces remount per cursor for fresh initial state */}
      {visibleIndices.length === 0 ? (
        <div className="rounded-lg border border-border p-6 text-center text-sm text-muted">
          Δεν υπάρχουν καρτέλες σε αυτό το φίλτρο.
        </div>
      ) : (
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
          familyHints={currentMatched.familyHints}
        />
      )}

      {commitError && <p className="text-sm text-rose-600">{commitError}</p>}

      {/* Footer */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface p-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handlePrev}
            disabled={isFirstVisible || committing}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm transition hover:bg-background disabled:opacity-50"
          >
            ← Προηγούμενο
          </button>
          <button
            type="button"
            onClick={handleNext}
            disabled={isLastVisible || committing}
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
