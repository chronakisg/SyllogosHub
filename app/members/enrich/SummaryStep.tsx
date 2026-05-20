"use client";

// app/members/enrich/SummaryStep.tsx
//
// Step 4 — final summary post-commit. Counts + skipped CSV download.
// Pure render component (no fetch, all data from state).
//
// CSV strategy: manual serializer με UTF-8 BOM prefix για Excel Greek
// compat. papaparse NOT installed — inline csvEscape helper (≤ 10 lines).

import { type Dispatch } from "react";
import { useRouter } from "next/navigation";

import { FAMILY_SIGNAL_LABELS, type FamilyHint } from "@/lib/enrich/family";
import type { ExcelCellValue } from "@/lib/enrich/types";

import {
  type WizardAction,
  type WizardState,
} from "./_state";

// U+FEFF — UTF-8 byte order mark. Required prefix ώστε το Excel να
// αναγνωρίσει το CSV ως UTF-8 (ειδάλλως ελληνικά εμφανίζονται mojibake).
// Explicit escape (όχι literal char) για να μην confuse-άρει diff tools.
const BOM = "\uFEFF";

type SummaryStateOnly = Extract<WizardState, { step: "summary" }>;

type Props = {
  state: SummaryStateOnly;
  dispatch: Dispatch<WizardAction>;
};

export function SummaryStep({ state, dispatch }: Props) {
  const router = useRouter();
  const { result, normalizedRows, perRow, filename } = state;

  function handleDownloadCSV() {
    if (result.skipped.length === 0) return;

    // Headers: original Excel headers (από .raw της πρώτης row) + '_reason'
    const sample = normalizedRows[0]?.raw ?? {};
    const headers = Object.keys(sample);
    const allHeaders = [...headers, "_reason", "_likely_family_of"];

    const lines: string[] = [allHeaders.map(csvEscape).join(",")];
    for (const skip of result.skipped) {
      const orig = normalizedRows.find((n) => n.rowIndex === skip.rowIndex)?.raw ?? {};
      const cells = headers.map((h) => csvEscape(orig[h]));
      cells.push(csvEscape(skip.reason));
      const familyHints =
        perRow.find((r) => r.rowIndex === skip.rowIndex)?.familyHints ?? [];
      cells.push(csvEscape(formatFamilyHints(familyHints)));
      lines.push(cells.join(","));
    }
    const csv = lines.join("\n");

    const blob = new Blob([BOM + csv], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = makeDownloadFilename(filename);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleReturn() {
    dispatch({ type: "RESET" });
    router.push("/members");
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-6">
      <h2 className="text-base font-semibold tracking-tight">Ολοκλήρωση</h2>

      <ul className="mt-3 space-y-1 text-sm">
        <li>
          <span className="mr-2">✅</span>
          <strong>{result.enriched}</strong> γραμμές ενημερώθηκαν
        </li>
        <li>
          <span className="mr-2">⏭</span>
          <strong>{result.skipped.length}</strong> γραμμές παραλείφθηκαν
        </li>
        {result.failed.length > 0 && (
          <li className="text-rose-600">
            <span className="mr-2">❌</span>
            <strong>{result.failed.length}</strong> γραμμές απέτυχαν
          </li>
        )}
      </ul>

      {result.failed.length > 0 && (
        <details className="mt-4 rounded-lg border border-border bg-background p-3 text-sm">
          <summary className="cursor-pointer text-rose-600">
            Δείτε τις αποτυχίες
          </summary>
          <ul className="mt-2 space-y-1">
            {result.failed.map((f) => (
              <li key={f.rowIndex} className="text-xs">
                Row {f.rowIndex + 1}: <span className="text-muted">{f.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleDownloadCSV}
          disabled={result.skipped.length === 0}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm transition hover:bg-background disabled:opacity-50"
        >
          📥 Λήψη skipped CSV
        </button>
        <button
          type="button"
          onClick={handleReturn}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90"
        >
          Επιστροφή στη λίστα μελών
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// CSV helpers (inline — papaparse not installed)
// ──────────────────────────────────────────────────────────────────

function formatFamilyHints(hints: FamilyHint[]): string {
  if (hints.length === 0) return "";
  return hints
    .map((h) => {
      const signalLabels = h.signals
        .map((s) => FAMILY_SIGNAL_LABELS[s])
        .join("+");
      return `${h.memberName} [${signalLabels}]`;
    })
    .join("; ");
}

function csvEscape(val: ExcelCellValue | string | unknown): string {
  if (val === null || val === undefined) return "";
  const s = typeof val === "string" ? val : String(val);
  if (
    s.includes(",") ||
    s.includes('"') ||
    s.includes("\n") ||
    s.includes("\r")
  ) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function makeDownloadFilename(originalFilename: string): string {
  const stem = originalFilename.replace(/\.(xlsx|xls|csv)$/i, "");
  const stamp = new Date().toISOString().slice(0, 10);
  return `skipped_${stem}_${stamp}.csv`;
}
