// lib/enrich/types.ts
//
// Types-only module για το Member Enrichment Wizard.
// Καμία runtime logic — μόνο shape definitions + ENRICH_FIELDS
// whitelist constant που χρησιμοποιείται και από library και από API.

// ──────────────────────────────────────────────────────────────────
// Enrichment whitelist
// ──────────────────────────────────────────────────────────────────

/**
 * Fields που επιτρέπεται να ενημερώσει ο wizard.
 *
 * Mirror του `/api/me/[token]/update` ALLOWED_FIELDS + 'email'
 * (fill-only — βλ. plan §6.2).
 *
 * Όλα τα υπόλοιπα members columns είναι explicitly excluded:
 * - first_name/last_name → core identity, αλλάζουν μέσω /members modal
 * - registry_number/application_* → admin-only γραμματείας
 * - email_verified/email_verification_* → resend flow
 * - is_board_member/is_president/board_position → role-related
 * - user_id/family_id/family_role → διαφορετικά domains
 */
export const ENRICH_FIELDS = [
  "phone",
  "birth_date",
  "birthplace",
  "residence",
  "address",
  "occupation",
  "father_name",
  "mother_name",
  "maiden_name",
  "email",
] as const;

export type EnrichField = (typeof ENRICH_FIELDS)[number];

// ──────────────────────────────────────────────────────────────────
// Excel row representation
// ──────────────────────────────────────────────────────────────────

/**
 * Cell values μετά από parseExcel normalization.
 * Date objects flattened σε ISO strings στο parsing layer.
 */
export type ExcelCellValue = string | number | boolean | null;

/**
 * Raw row από parsed sheet: header → cell value.
 * Keys είναι τα original Excel headers (trimmed).
 */
export type ExcelRow = Record<string, ExcelCellValue>;

// ──────────────────────────────────────────────────────────────────
// Column mapping
// ──────────────────────────────────────────────────────────────────

/**
 * Match targets: είτε ένα enrich-able field, είτε τα 2 required
 * identity fields (first_name/last_name — οδηγούν το matching χωρίς
 * να είναι editable), είτε 'ignore' για out-of-scope columns.
 */
export type ColumnTarget = EnrichField | "first_name" | "last_name" | "ignore";

/**
 * Αντιστοιχία μεταξύ Excel header και target field στο SyllogosHub schema.
 * `autoDetected: true` αν το mapping προέκυψε από columnMapper auto-detect
 * (admin μπορεί να το παρακάμψει στο Step 2 dropdown).
 */
export type MappedColumn = {
  excelHeader: string;
  target: ColumnTarget;
  autoDetected: boolean;
};

// ──────────────────────────────────────────────────────────────────
// Normalized row για matching
// ──────────────────────────────────────────────────────────────────

/**
 * Excel row μετά από column mapping + normalization. Αυτή είναι η
 * canonical shape που τρώει το scoring engine.
 *
 * - `values` — mapped, trimmed, parsed (dates → ISO, phone → first digit-run)
 * - `phones` — όλες οι phones της row (digits-only, post-split), για
 *    multi-phone matching (πχ "6939... - 6937... - 6937..." → 3 entries)
 * - `raw` — τα original cells για downstream needs (skipped CSV export)
 */
export type NormalizedExcelRow = {
  rowIndex: number; // 0-based, μετά το header row
  raw: ExcelRow;
  values: Partial<Record<ColumnTarget, string | null>>;
  phones: string[];
};

// ──────────────────────────────────────────────────────────────────
// Match candidates
// ──────────────────────────────────────────────────────────────────

/**
 * Διακριτά scoring signals — επιτρέπει UI να εξηγεί γιατί ο candidate
 * πέρασε το threshold (πχ "📞 phone exact ✅"). Βλ. plan §4.1.
 */
export type MatchSignal =
  | "email_exact"
  | "phone_exact"
  | "lastname_exact"
  | "firstname_exact"
  | "firstname_fuzzy"
  | "father_name_exact"
  | "address_overlap";

/**
 * Ένας πιθανός match για μια Excel row.
 * `score` είναι 0-100 (sum of signal weights, capped).
 */
export type MatchCandidate = {
  memberId: string;
  score: number;
  signals: MatchSignal[];
};

// ──────────────────────────────────────────────────────────────────
// Admin decisions per row
// ──────────────────────────────────────────────────────────────────

/**
 * Reason για skip — driven είτε από no-match auto-skip είτε από
 * explicit admin click. Εξάγεται στο skipped CSV (`_reason` column).
 */
export type SkipReason = "no_match" | "admin_skipped";

/**
 * Τελική απόφαση admin για μία row. Discriminated union:
 * - `apply` → matched έναν member + decided fieldUpdates
 * - `skip` → row πάει στο downloadable CSV
 */
export type EnrichmentDecision =
  | {
      kind: "apply";
      rowIndex: number;
      memberId: string;
      /** Subset των ENRICH_FIELDS με τις νέες τιμές. */
      fieldUpdates: Partial<Record<EnrichField, string | null>>;
    }
  | {
      kind: "skip";
      rowIndex: number;
      reason: SkipReason;
    };
