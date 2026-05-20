// lib/enrich/normalize.ts
//
// Phone splitting + date parsing utilities + per-row normalization
// για το Member Enrichment Wizard.
//
// Pure functions — zero IO, zero DB.

import { toUpperCaseGreek } from "@/lib/utils/greekSearch";

import type {
  ColumnTarget,
  ExcelCellValue,
  ExcelRow,
  MappedColumn,
  NormalizedExcelRow,
} from "./types";

// ──────────────────────────────────────────────────────────────────
// UPPERCASE_FIELDS — Greek civil-records convention
// ──────────────────────────────────────────────────────────────────

// Fields που γράφονται ΚΕΦΑΛΑΙΑ per Greek civil-records convention.
// Note: occupation excluded (genuinely variable casing).
// Note: email excluded (lowercase per spec, handled separately).
const UPPERCASE_FIELDS: ReadonlySet<ColumnTarget> = new Set([
  "first_name",
  "last_name",
  "father_name",
  "mother_name",
  "maiden_name",
  "address",
  "birthplace",
  "residence",
]);

// ──────────────────────────────────────────────────────────────────
// digitsOnly
// ──────────────────────────────────────────────────────────────────

/**
 * Strip ότι δεν είναι ψηφίο. Empty/null → "".
 * Χρησιμοποιείται και στο matching (members.phone normalization) και
 * στο phone split below.
 */
export function digitsOnly(s: string | null | undefined): string {
  if (!s) return "";
  return String(s).replace(/\D+/g, "");
}

// ──────────────────────────────────────────────────────────────────
// splitPhones
// ──────────────────────────────────────────────────────────────────

/**
 * Εξάγει όλες τις phones από raw string. Generic separator handling:
 * δέχεται " - ", " / ", ",", newlines κλπ — απλώς ψάχνει για consecutive
 * digit runs ≥ 6 chars (mobile/landline lower bound).
 *
 * @example
 *   splitPhones("6939333782 - 6937874261 - 6937833450")
 *     // → ["6939333782", "6937874261", "6937833450"]
 *   splitPhones("(210) 1234567")
 *     // → ["2101234567"]  // single normalized run
 *   splitPhones("210-1234567, 6944-555-666")
 *     // → ["2101234567", "6944555666"]
 */
export function splitPhones(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const s = String(raw);
  // Split σε non-digit separators που είναι ξεκάθαρα phone-separating
  // (' - ', ',', '/', newline). Για cases όπως "210-1234567" το dash
  // ΔΕΝ θεωρείται separator (no space γύρω) → digitsOnly merge.
  const chunks = s.split(/\s+[-/]\s+|[,\n;]+/);
  const out: string[] = [];
  for (const c of chunks) {
    const d = digitsOnly(c);
    if (d.length >= 6) out.push(d);
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────
// parseDate
// ──────────────────────────────────────────────────────────────────

/**
 * Parse μια date από Excel cell σε ISO YYYY-MM-DD string. Επιστρέφει
 * null όταν δεν αναγνωρίζεται.
 *
 * Supported formats (per plan §4 / Phase 1 test cases):
 *   1. Date object (instanceof Date)
 *   2. Excel serial number (πχ 42710 → "2016-12-07")
 *   3. ISO              "2019-09-15"
 *   4. DD-MM-YYYY       "07-12-2015"   (also D-M-YYYY: "9-12-2012")
 *   5. DD/MM/YYYY       "07/12/2015"
 *   6. DD.MM.YYYY       "07.12.2015"
 *   7. DD-MM-YY         "10-1-11"      (2-digit year — pivot στο 30)
 *
 * 2-digit year pivot: 00-29 → 2000s, 30-99 → 1900s.
 */
export function parseDate(
  input: ExcelCellValue | Date | null | undefined,
): string | null {
  if (input === null || input === undefined || input === "") return null;

  if (input instanceof Date) {
    return isNaN(input.getTime()) ? null : toISO(input);
  }

  if (typeof input === "number") {
    // Excel serial → JS Date. Day 25569 = Unix epoch (1970-01-01).
    // Lotus 1-2-3 leap year bug για dates >= 1900-03-01: built into ratio.
    const ms = (input - 25569) * 86400 * 1000;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : toISO(d);
  }

  if (typeof input === "boolean") return null;

  const s = String(input).trim();
  if (!s) return null;

  // ISO YYYY-MM-DD (also tolerant για slash variant "2019/09/15")
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return makeISO(m[1], m[2], m[3]);

  // DD-MM-YYYY με 4-digit year (dash, slash, dot)
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return makeISO(m[3], m[2], m[1]);

  // DD-MM-YY με 2-digit year
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/);
  if (m) {
    const yy = parseInt(m[3], 10);
    const yyyy = yy < 30 ? 2000 + yy : 1900 + yy;
    return makeISO(String(yyyy), m[2], m[1]);
  }

  return null;
}

function makeISO(yyyy: string, mm: string, dd: string): string | null {
  const y = parseInt(yyyy, 10);
  const mo = parseInt(mm, 10);
  const d = parseInt(dd, 10);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  // Validate via Date roundtrip (catches 31 Φεβρ., 31 Απρ., κλπ)
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (
    isNaN(date.getTime()) ||
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== mo - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }
  return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function toISO(d: Date): string {
  const y = d.getUTCFullYear();
  const mo = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return `${y}-${String(mo).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// ──────────────────────────────────────────────────────────────────
// normalizeRow
// ──────────────────────────────────────────────────────────────────

/**
 * Μετατρέπει raw ExcelRow + column mapping → canonical NormalizedExcelRow
 * για το matching engine.
 *
 * Behaviors:
 *   - 'ignore' targets παραλείπονται
 *   - phone column → split σε all phones (digits-only). To first αποθηκεύεται
 *     στο values.phone για conflict diff UI, η full λίστα στο phones[]
 *     για multi-phone matching
 *   - birth_date column → parsed σε ISO. Unparseable → field omitted
 *   - all other string targets → trimmed
 */
export function normalizeRow(
  raw: ExcelRow,
  mapping: MappedColumn[],
  rowIndex: number,
): NormalizedExcelRow {
  const values: Partial<Record<ColumnTarget, string | null>> = {};
  const phones: string[] = [];

  for (const col of mapping) {
    if (col.target === "ignore") continue;

    const cell = raw[col.excelHeader];
    if (cell === null || cell === undefined) continue;

    if (col.target === "phone") {
      const split = splitPhones(stringify(cell));
      if (split.length > 0) {
        for (const p of split) phones.push(p);
        values.phone = split[0];
      }
      continue;
    }

    if (col.target === "birth_date") {
      const iso = parseDate(cell);
      if (iso) values.birth_date = iso;
      continue;
    }

    const str = stringify(cell).trim();
    if (str) {
      values[col.target] = UPPERCASE_FIELDS.has(col.target)
        ? toUpperCaseGreek(str)
        : str;
    }
  }

  return { rowIndex, raw, values, phones };
}

function stringify(cell: ExcelCellValue): string {
  if (cell === null || cell === undefined) return "";
  if (typeof cell === "string") return cell;
  if (typeof cell === "number" || typeof cell === "boolean") return String(cell);
  return String(cell);
}
