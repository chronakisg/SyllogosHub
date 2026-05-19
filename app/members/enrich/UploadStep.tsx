"use client";

// app/members/enrich/UploadStep.tsx
//
// Step 1 — file upload + parse. Client-side validation (size, extension)
// + parseExcel wrapper (lib/enrich/parseExcel). Καμία network call —
// parsing γίνεται εξ ολοκλήρου στο browser.

import { useState, type ChangeEvent, type Dispatch } from "react";

import { parseExcel } from "@/lib/enrich/parseExcel";

import type { WizardAction } from "./_state";

// Plan §2.3: 5MB file cap (~10k rows).
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = [".xlsx", ".xls", ".csv"] as const;

type Props = {
  dispatch: Dispatch<WizardAction>;
};

export function UploadStep({ dispatch }: Props) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setError(null);

    if (!file) {
      setSelectedFile(null);
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError(
        `Το αρχείο ξεπερνά το όριο των 5MB (μέγεθος: ${formatBytes(file.size)}).`,
      );
      setSelectedFile(null);
      return;
    }
    const lower = file.name.toLowerCase();
    const matchesExt = ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
    if (!matchesExt) {
      setError(
        `Μη υποστηριζόμενος τύπος αρχείου. Δεκτοί τύποι: ${ACCEPTED_EXTENSIONS.join(", ")}.`,
      );
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);
  }

  async function handleParse() {
    if (!selectedFile) return;
    setParsing(true);
    setError(null);
    try {
      const buffer = await selectedFile.arrayBuffer();
      const result = parseExcel(buffer);
      dispatch({ type: "FILE_PARSED", file: selectedFile, result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Σφάλμα ανάλυσης αρχείου.";
      setError(msg);
    } finally {
      setParsing(false);
    }
  }

  const canParse = selectedFile !== null && !parsing && error === null;

  return (
    <div className="rounded-lg border border-border bg-surface p-6">
      <h2 className="text-base font-semibold tracking-tight">
        Επιλογή αρχείου
      </h2>
      <p className="mt-2 text-sm text-muted">
        Ανέβασε αρχείο για να ενημερώσεις τα στοιχεία υπαρχόντων μελών. Το
        wizard ταιριάζει κάθε γραμμή με υπάρχον μέλος, και επιβεβαιώνεις
        manually τι θα ενημερωθεί ανά πεδίο.
      </p>
      <p className="mt-1 text-sm text-muted">
        Νέα μέλη δημιουργούνται κανονικά από το «+ Νέο Μέλος» button στη
        λίστα μελών — εδώ μόνο enrichment υπαρχόντων.
      </p>

      <div className="mt-4">
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleFileChange}
          disabled={parsing}
          className="block w-full text-sm file:mr-3 file:rounded-lg file:border file:border-border file:bg-background file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-surface"
        />
      </div>

      {selectedFile && !error && (
        <p className="mt-3 text-sm text-muted">
          Επιλεγμένο: <strong>{selectedFile.name}</strong>{" "}
          ({formatBytes(selectedFile.size)})
        </p>
      )}
      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
      {parsing && (
        <p className="mt-3 text-sm text-muted">Ανάλυση αρχείου…</p>
      )}

      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={handleParse}
          disabled={!canParse}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
        >
          Ανάλυση αρχείου →
        </button>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
