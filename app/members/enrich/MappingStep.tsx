"use client";

// app/members/enrich/MappingStep.tsx
//
// Step 2 — column mapping. Renders Excel headers → SyllogosHub field
// dropdowns, με auto-detect badge όταν columnMapper το ταιριάζει αυτόματα.
// Preview των first 3 rows του selected sheet.
//
// "Έλεγχος matches →" CTA: validates first_name + last_name mapped,
// normalize-arei τα rows, POSTs σε /api/members/enrich/match, dispatchει
// MATCH_LOADED στο reducer.

import { useMemo, useState, type Dispatch } from "react";

import type { MatchableMember } from "@/lib/enrich/match";
import { normalizeRow } from "@/lib/enrich/normalize";
import type { ColumnTarget } from "@/lib/enrich/types";

import {
  mappingToMappedColumns,
  type MatchedRow,
  type WizardAction,
  type WizardState,
} from "./_state";

type MappingStateOnly = Extract<WizardState, { step: "mapping" }>;

type Props = {
  state: MappingStateOnly;
  dispatch: Dispatch<WizardAction>;
};

export function MappingStep({ state, dispatch }: Props) {
  const [matching, setMatching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedSheet = state.sheets[state.selectedSheetIndex];

  const canProceed = useMemo(() => {
    const fields = Object.values(state.mapping);
    return fields.includes("first_name") && fields.includes("last_name");
  }, [state.mapping]);

  async function handleMatch() {
    if (!canProceed || !selectedSheet) return;
    setMatching(true);
    setError(null);
    try {
      const mappedColumns = mappingToMappedColumns(
        state.mapping,
        selectedSheet.headers,
        state.autoDetectedHeaders,
      );
      const normalizedRows = selectedSheet.rows.map((row, i) =>
        normalizeRow(row, mappedColumns, i),
      );
      const response = await fetch("/api/members/enrich/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mappedRows: normalizedRows,
          filename: state.filename,
        }),
      });
      if (!response.ok) {
        const detail = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(detail?.error ?? `Αποτυχία (HTTP ${response.status}).`);
        return;
      }
      const data = (await response.json()) as {
        perRow: MatchedRow[];
        allMembers: MatchableMember[];
      };
      dispatch({
        type: "MATCH_LOADED",
        normalizedRows,
        perRow: data.perRow,
        allMembers: data.allMembers,
      });
    } catch {
      setError("Σφάλμα δικτύου — δοκίμασε ξανά.");
    } finally {
      setMatching(false);
    }
  }

  if (!selectedSheet) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-sm text-rose-600">
        Δεν επιλέχθηκε φύλλο εργασίας.
      </div>
    );
  }

  const previewRows = selectedSheet.rows.slice(0, 3);

  return (
    <div className="space-y-4">
      {/* Mapping card */}
      <div className="rounded-lg border border-border bg-surface p-4">
        <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold tracking-tight">
            Αντιστοίχιση στηλών
          </h2>
          <span className="text-xs text-muted">{state.filename}</span>
        </header>

        {state.sheets.length > 1 && (
          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-muted">
              Φύλλο εργασίας
            </label>
            <select
              value={state.selectedSheetIndex}
              onChange={(e) =>
                dispatch({
                  type: "SELECT_SHEET",
                  sheetIndex: parseInt(e.target.value, 10),
                })
              }
              disabled={matching}
              className="block w-full max-w-md rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
            >
              {state.sheets.map((s, i) => (
                <option key={s.sheetName} value={i}>
                  {s.sheetName} ({s.rows.length} γραμμές)
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="py-2 pr-4 font-medium">Στήλη Excel</th>
                <th className="py-2 pr-4 font-medium">Πεδίο SyllogosHub</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {selectedSheet.headers.map((header) => (
                <tr key={header} className="border-b border-border/60">
                  <td className="py-2 pr-4 font-medium">{header}</td>
                  <td className="py-2 pr-4">
                    <select
                      value={state.mapping[header] ?? "ignore"}
                      onChange={(e) =>
                        dispatch({
                          type: "UPDATE_MAPPING",
                          column: header,
                          field: e.target.value as ColumnTarget,
                        })
                      }
                      disabled={matching}
                      className="rounded-lg border border-border bg-background px-2 py-1 text-sm disabled:opacity-50"
                    >
                      <option value="ignore">— Αγνόηση —</option>
                      <optgroup label="Στοιχεία ταυτότητας">
                        <option value="first_name">Όνομα</option>
                        <option value="last_name">Επώνυμο</option>
                      </optgroup>
                      <optgroup label="Στοιχεία επικοινωνίας">
                        <option value="phone">Τηλέφωνο</option>
                        <option value="email">Email</option>
                        <option value="address">Διεύθυνση</option>
                        <option value="residence">Τόπος κατοικίας</option>
                      </optgroup>
                      <optgroup label="Στοιχεία ταυτοποίησης">
                        <option value="birth_date">
                          Ημερομηνία γέννησης
                        </option>
                        <option value="birthplace">Τόπος γέννησης</option>
                        <option value="father_name">Όνομα πατέρα</option>
                        <option value="mother_name">Όνομα μητέρας</option>
                        <option value="maiden_name">Πατρικό επώνυμο</option>
                        <option value="occupation">Επάγγελμα</option>
                      </optgroup>
                    </select>
                  </td>
                  <td className="py-2 text-xs text-muted">
                    {state.autoDetectedHeaders.has(header) && (
                      <span title="Auto-detected από header">✓ auto</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Preview card */}
      <div className="rounded-lg border border-border bg-surface p-4">
        <h3 className="mb-2 text-sm font-semibold">
          Preview (πρώτες 3 γραμμές)
        </h3>
        {previewRows.length === 0 ? (
          <p className="text-sm text-muted">Το φύλλο είναι κενό.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  {selectedSheet.headers.map((h) => (
                    <th key={h} className="py-2 pr-3 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, i) => (
                  <tr key={i} className="border-b border-border/60">
                    {selectedSheet.headers.map((h) => {
                      const v = row[h];
                      return (
                        <td key={h} className="py-1 pr-3">
                          {v === null || v === "" ? (
                            <span className="text-muted">(κενό)</span>
                          ) : (
                            String(v)
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      {/* Footer actions */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => dispatch({ type: "RESET" })}
          disabled={matching}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm transition hover:bg-background disabled:opacity-50"
        >
          ← Επιλογή άλλου αρχείου
        </button>

        <div className="flex items-center gap-3">
          {!canProceed && (
            <span className="text-xs text-muted">
              Πρέπει να αντιστοιχίσεις «Όνομα» και «Επώνυμο» για να συνεχίσεις
            </span>
          )}
          <button
            type="button"
            onClick={handleMatch}
            disabled={!canProceed || matching}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
          >
            {matching ? "Έλεγχος…" : "Έλεγχος matches →"}
          </button>
        </div>
      </div>
    </div>
  );
}
