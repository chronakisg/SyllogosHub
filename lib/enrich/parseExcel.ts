// lib/enrich/parseExcel.ts
//
// Excel/CSV/XLS parsing wrapper γύρω από SheetJS (xlsx@0.18.5).
// Pure function — δέχεται binary buffer, επιστρέφει structured data.
//
// Supported formats (plan §2.1): .xlsx, .xls (legacy), .csv
// SheetJS εντοπίζει το format αυτόματα από magic bytes.

import * as XLSX from "xlsx";

import type { ExcelCellValue, ExcelRow } from "./types";

// ──────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────

export type ParsedSheet = {
  sheetName: string;
  headers: string[];
  rows: ExcelRow[];
};

export type ParseResult = {
  sheets: ParsedSheet[];
  /**
   * Το πρώτο sheet με data. SheetJS workbooks έχουν συχνά μεταδεδομένα/
   * empty sheets στην αρχή — `primarySheet` δίνει sane default για UI
   * preview χωρίς να χάνεται info για admin sheet-picker (future).
   */
  primarySheet: ParsedSheet;
};

// ──────────────────────────────────────────────────────────────────
// parseExcel
// ──────────────────────────────────────────────────────────────────

/**
 * Parse binary buffer σε structured sheets/headers/rows.
 *
 * @param buffer raw bytes (ArrayBuffer ή Uint8Array — server-side
 *               Buffer επίσης βατό αφού είναι Uint8Array subclass)
 * @throws Error αν workbook δεν έχει κανένα sheet ή κανένα row
 */
export function parseExcel(buffer: ArrayBuffer | Uint8Array): ParseResult {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });

  if (!wb.SheetNames || wb.SheetNames.length === 0) {
    throw new Error("Το αρχείο δεν περιέχει sheets");
  }

  const sheets: ParsedSheet[] = [];

  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    if (!sheet) {
      sheets.push({ sheetName: name, headers: [], rows: [] });
      continue;
    }

    const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: null,
      raw: true,
      blankrows: false,
    });

    if (aoa.length === 0) {
      sheets.push({ sheetName: name, headers: [], rows: [] });
      continue;
    }

    const headerCells = (aoa[0] ?? []) as unknown[];
    const headers = headerCells.map((h) =>
      h === null || h === undefined ? "" : String(h).trim()
    );

    const rows: ExcelRow[] = [];
    for (let i = 1; i < aoa.length; i++) {
      const cells = (aoa[i] ?? []) as unknown[];

      // Skip πλήρως-empty rows (defensive — `blankrows: false` συνήθως
      // φτάνει, αλλά rows με μόνο empty strings δεν φιλτράρονται από SheetJS)
      const hasData = cells.some((c) => {
        if (c === null || c === undefined) return false;
        if (typeof c === "string") return c.trim() !== "";
        return true;
      });
      if (!hasData) continue;

      const row: ExcelRow = {};
      for (let j = 0; j < headers.length; j++) {
        const key = headers[j];
        if (!key) continue; // skip unnamed columns
        row[key] = normalizeCell(cells[j]);
      }
      rows.push(row);
    }

    sheets.push({
      sheetName: name,
      headers: headers.filter((h) => h.length > 0),
      rows,
    });
  }

  const primary =
    sheets.find((s) => s.rows.length > 0) ?? sheets[0];
  if (!primary) {
    throw new Error("Το αρχείο δεν περιέχει δεδομένα");
  }

  return { sheets, primarySheet: primary };
}

function normalizeCell(v: unknown): ExcelCellValue {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) {
    return isNaN(v.getTime()) ? null : v.toISOString();
  }
  if (typeof v === "number" || typeof v === "boolean") return v;
  const s = String(v).trim();
  return s === "" ? null : s;
}
