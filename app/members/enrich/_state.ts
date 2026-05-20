// app/members/enrich/_state.ts
//
// Reducer + types + adapter για το Member Enrichment Wizard UI.
// Zero JSX — pure state machine + types module.
//
// Wizard flow: upload → mapping → review → summary
// Each step's data lives in a discriminated WizardState variant.
//
// All transitions immutable (new objects, new Maps/Sets). Defensive
// step guards: actions που δεν ταιριάζουν με το current step
// επιστρέφουν unchanged state αντί να crash-άρουν.

import { buildInitialDecision } from "@/lib/enrich/autoDecision";
import { autoDetectMapping } from "@/lib/enrich/columnMapper";
import type { FamilyHint } from "@/lib/enrich/family";
import type { MatchableMember } from "@/lib/enrich/match";
import type { ParsedSheet, ParseResult } from "@/lib/enrich/parseExcel";
import type {
  ColumnTarget,
  EnrichmentDecision,
  MappedColumn,
  MatchCandidate,
  NormalizedExcelRow,
} from "@/lib/enrich/types";

// ──────────────────────────────────────────────────────────────────
// Public type aliases
// ──────────────────────────────────────────────────────────────────

/**
 * Mapping από Excel header → target field. Single source of truth
 * για το column dropdown selection state. autoDetected flag tracked
 * ξεχωριστά στο WizardState.autoDetectedHeaders για να μη βαρύνει
 * το UPDATE_MAPPING action.
 */
export type ColumnMapping = Record<string, ColumnTarget>;

/**
 * Per-row server response από /api/members/enrich/match.
 * Wire-format type — mirror του route response shape.
 */
export type MatchedRow = {
  rowIndex: number;
  candidates: MatchCandidate[];
  familyHints: FamilyHint[];
};

/**
 * Commit endpoint response (μετά POST /api/members/enrich/commit).
 * Reviewed στο SummaryStep (Commit 4b).
 */
export type CommitResponse = {
  enriched: number;
  skipped: Array<{ rowIndex: number; reason: "admin_skipped" | "no_match" }>;
  failed: Array<{ rowIndex: number; reason: string }>;
};

// ──────────────────────────────────────────────────────────────────
// WizardState — discriminated union ανά step
// ──────────────────────────────────────────────────────────────────

export type WizardState =
  | { step: "upload" }
  | {
      step: "mapping";
      file: File;
      filename: string;
      sheets: ParsedSheet[];
      selectedSheetIndex: number;
      mapping: ColumnMapping;
      autoDetectedHeaders: Set<string>;
    }
  | {
      step: "review";
      filename: string;
      normalizedRows: NormalizedExcelRow[];
      perRow: MatchedRow[];
      allMembers: MatchableMember[];
      decisions: Map<number, EnrichmentDecision>;
      cursor: number;
      filter: "all" | "decided" | "pending";
    }
  | {
      step: "summary";
      filename: string;
      result: CommitResponse;
      /**
       * Forwarded από review state. SummaryStep χρησιμοποιεί `.raw`
       * των skipped rows για να φτιάξει το download CSV (plan §1.2).
       */
      normalizedRows: NormalizedExcelRow[];
      /**
       * Forwarded από review state. SummaryStep διαβάζει
       * `perRow[i].familyHints` για το `_likely_family_of` CSV column
       * (see MEMBER_ENRICH_FAMILY_PLAN.md §7).
       */
      perRow: MatchedRow[];
    };

// ──────────────────────────────────────────────────────────────────
// WizardAction — discriminated union
// ──────────────────────────────────────────────────────────────────

export type WizardAction =
  | { type: "FILE_PARSED"; file: File; result: ParseResult }
  | { type: "SELECT_SHEET"; sheetIndex: number }
  | { type: "UPDATE_MAPPING"; column: string; field: ColumnTarget }
  | {
      type: "MATCH_LOADED";
      normalizedRows: NormalizedExcelRow[];
      perRow: MatchedRow[];
      allMembers: MatchableMember[];
    }
  | { type: "SET_DECISION"; rowIndex: number; decision: EnrichmentDecision }
  | { type: "SET_CURSOR"; cursor: number }
  | { type: "SET_FILTER"; filter: "all" | "decided" | "pending" }
  | {
      type: "COMMIT_DONE";
      result: CommitResponse;
    }
  | { type: "RESET" };

export const INITIAL_STATE: WizardState = { step: "upload" };

// ──────────────────────────────────────────────────────────────────
// Helpers (internal)
// ──────────────────────────────────────────────────────────────────

function buildMappingFromHeaders(headers: string[]): {
  mapping: ColumnMapping;
  autoDetectedHeaders: Set<string>;
} {
  const detected = autoDetectMapping(headers);
  const mapping: ColumnMapping = {};
  const autoDetectedHeaders = new Set<string>();
  for (const m of detected) {
    mapping[m.excelHeader] = m.target;
    if (m.autoDetected) autoDetectedHeaders.add(m.excelHeader);
  }
  return { mapping, autoDetectedHeaders };
}

// ──────────────────────────────────────────────────────────────────
// reducer
// ──────────────────────────────────────────────────────────────────

export function reducer(
  state: WizardState,
  action: WizardAction,
): WizardState {
  switch (action.type) {
    case "FILE_PARSED": {
      if (state.step !== "upload") return state;
      const sheets = action.result.sheets;
      const primary = sheets[0];
      const { mapping, autoDetectedHeaders } = buildMappingFromHeaders(
        primary?.headers ?? [],
      );
      return {
        step: "mapping",
        file: action.file,
        filename: action.file.name,
        sheets,
        selectedSheetIndex: 0,
        mapping,
        autoDetectedHeaders,
      };
    }

    case "SELECT_SHEET": {
      if (state.step !== "mapping") return state;
      const newSheet = state.sheets[action.sheetIndex];
      if (!newSheet) return state;
      // Sheet switch → fresh auto-detect. Admin overrides από
      // προηγούμενο sheet δεν διατηρούνται (απλούστερη invariant).
      const { mapping, autoDetectedHeaders } = buildMappingFromHeaders(
        newSheet.headers,
      );
      return {
        ...state,
        selectedSheetIndex: action.sheetIndex,
        mapping,
        autoDetectedHeaders,
      };
    }

    case "UPDATE_MAPPING": {
      if (state.step !== "mapping") return state;
      const nextAuto = new Set(state.autoDetectedHeaders);
      // Admin override → drop auto badge (η νέα τιμή είναι manual).
      nextAuto.delete(action.column);
      return {
        ...state,
        mapping: { ...state.mapping, [action.column]: action.field },
        autoDetectedHeaders: nextAuto,
      };
    }

    case "MATCH_LOADED": {
      if (state.step !== "mapping") return state;
      const { normalizedRows, perRow, allMembers } = action;

      // Pre-populate decisions για rows που έχουν high-confidence match
      // με non-trivial auto-tick fields. Admin μπορεί να κάνει override
      // per-row στο ReviewStep. Rows χωρίς auto-decision παραμένουν
      // undecided → handleCommit defaults σε admin_skipped.
      const initialDecisions = new Map<number, EnrichmentDecision>();
      for (let i = 0; i < normalizedRows.length; i++) {
        const row = normalizedRows[i];
        const matched = perRow.find((r) => r.rowIndex === i);
        const initial = buildInitialDecision(
          i,
          row,
          matched?.candidates ?? [],
          allMembers,
        );
        if (initial) initialDecisions.set(i, initial);
      }

      return {
        step: "review",
        filename: state.filename,
        normalizedRows,
        perRow,
        allMembers,
        decisions: initialDecisions,
        cursor: 0,
        filter: "all",
      };
    }

    case "SET_DECISION": {
      if (state.step !== "review") return state;
      const nextDecisions = new Map(state.decisions);
      nextDecisions.set(action.rowIndex, action.decision);
      return { ...state, decisions: nextDecisions };
    }

    case "SET_CURSOR": {
      if (state.step !== "review") return state;
      const max = Math.max(0, state.normalizedRows.length - 1);
      const clamped = Math.max(0, Math.min(action.cursor, max));
      return { ...state, cursor: clamped };
    }

    case "SET_FILTER": {
      if (state.step !== "review") return state;
      const newFilter = action.filter;
      if (newFilter === state.filter) return state;

      const visibleIndices = computeVisibleIndices(state, newFilter);

      // Filter switch = navigation reset, ΟΧΙ "continue from here".
      // Jump to first visible row → counter shows "1 / N" matching user
      // expectation. Empty result: preserve cursor (UI shows empty-state).
      const newCursor =
        visibleIndices.length > 0 ? visibleIndices[0] : state.cursor;

      return { ...state, filter: newFilter, cursor: newCursor };
    }

    case "COMMIT_DONE": {
      if (state.step !== "review") return state;
      return {
        step: "summary",
        filename: state.filename,
        result: action.result,
        normalizedRows: state.normalizedRows,
        perRow: state.perRow,
      };
    }

    case "RESET": {
      return INITIAL_STATE;
    }

    default: {
      // Exhaustive check — αν προστεθεί νέο action type χωρίς case,
      // το TS θα crash-αρει εδώ.
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

// ──────────────────────────────────────────────────────────────────
// Review filter — visible row index computation
// ──────────────────────────────────────────────────────────────────

export function computeVisibleIndices(
  state: Extract<WizardState, { step: "review" }>,
  filter: "all" | "decided" | "pending",
): number[] {
  const indices: number[] = [];
  for (let i = 0; i < state.normalizedRows.length; i++) {
    const hasDecision = state.decisions.has(i);
    if (filter === "all") indices.push(i);
    else if (filter === "decided" && hasDecision) indices.push(i);
    else if (filter === "pending" && !hasDecision) indices.push(i);
  }
  return indices;
}

// ──────────────────────────────────────────────────────────────────
// Adapter — ColumnMapping → MappedColumn[]
// ──────────────────────────────────────────────────────────────────

/**
 * Μετατρέπει το state shape σε format που τρώει το lib/enrich/normalize
 * normalizeRow. Σκόπιμα δεν φιλτράρει 'ignore' targets — το normalize
 * τα παραλείπει μόνο του.
 */
export function mappingToMappedColumns(
  mapping: ColumnMapping,
  headers: string[],
  autoDetectedHeaders: Set<string>,
): MappedColumn[] {
  return headers
    .filter((h) => h.trim() !== "")
    .map((h) => ({
      excelHeader: h,
      target: mapping[h] ?? "ignore",
      autoDetected: autoDetectedHeaders.has(h),
    }));
}
