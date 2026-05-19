# Member Enrichment Wizard — Plan v2
# Generic Excel Cross-Reference για update existing members

> Last updated: 2026-05-19
> Branch (proposed): `feat/member-enrich-wizard`
> Estimated: M (1 PR, ~5 commits, zero migrations)
> Connects με: audit_log foundation (PR #49), permission system (PR ζ.2), Greek search normalization (PR #51)

---

## 🎯 Στόχος

Επιτρέπει στον admin να ανεβάσει σκόρπιο Excel/CSV (πχ `ΜΟΥΣΙΚΟΧΟΡΕΥΤΙΚΑ_ΤΜΗΜΑΤΑ`,
παλιές λίστες, κλπ) και:

1. Να ταιριάξει κάθε row με υπάρχον μέλος του συλλόγου
2. Να ενημερώσει **manually, per row, per field**, τα missing/stale fields
3. Να εξάγει CSV με τα rows που δεν matchάρανε, για manual import αργότερα

**Σημαντικό όριο scope**: ο wizard **ΔΕΝ** δημιουργεί νέα μέλη. New member creation
παραμένει στο `/members` "Νέο Μέλος" flow — υπάρχει σαφής διαχωρισμός responsibilities.

---

## 🔒 Locked Decisions (8)

### 1. New member creation: explicitly OUT of scope

**1.1** — Ο wizard κάνει **μόνο enrichment of existing members**. Αν Excel row
δεν matchάρει κανέναν existing member, η μόνη επιλογή είναι **SKIP**.

**1.2** — Στο commit summary, τα skipped rows εξάγονται σε **downloadable CSV**
με όλα τα original Excel data ώστε ο admin να τα πιάσει manually στο `/members`
"Νέο Μέλος" χωρίς re-typing.

**1.3** — Zero schema changes.

### 2. Source files

**2.1** — Supported: `.xlsx`, `.xls` (legacy), `.csv`.

**2.2** — Parsing μέσω **SheetJS** (xlsx@0.18.5 — ήδη installed).

**2.3** — File size cap: **5MB** (~10k rows). Για παραπάνω, ο admin τα σπάει σε chunks.

### 3. Column mapping: auto-detect με admin override

**3.1** — Auto-detect logic:
- Greek-normalized exact match σε known column names (`ΕΠΩΝΥΜΟ`, `ΟΝΟΜΑ`,
  `ΤΗΛΕΦΩΝΟ`, `EMAIL`, `ΔΙΕΥΘΥΝΣΗ`, `ΟΝΟΜΑ ΠΑΤΡΟΣ`, `ΟΝΟΜΑ ΜΗΤΡΟΣ`, `ΓΕΝΟΣ`,
  `ΕΠΑΓΓΕΛΜΑ`, `ΤΟΠΟΣ ΓΕΝΝΗΣΗΣ`, `ΤΟΠΟΣ ΚΑΤΟΙΚΙΑΣ`, `ΗΜΕΡΟΜΗΝΙΑ ΓΕΝΝΗΣΗΣ`)
- Fuzzy match (Levenshtein ≤ 2) ως fallback
- Pre-fill mapper με auto-detected pairs, admin βλέπει + override μέσω dropdown

**3.2** — Required fields για match: `last_name` + `first_name`. Χωρίς αυτά τα 2
mapped, ο wizard δείχνει error και δεν επιτρέπει "Επόμενο".

**3.3** — Optional fields για enrichment: μόνο τα fields του whitelist (§6).

**3.4** — "Αγνόηση" επιλογή σε κάθε column dropdown για out-of-scope data
(πχ `ΤΜΗΜΑ`, `ΟΚΤΩΒΡΙΟΣ` του ΜΟΥΣΙΚΟΧΟΡΕΥΤΙΚΑ).

### 4. Matching algorithm

**4.1** — Scoring (0-100):

| Signal | Points | Notes |
|---|---|---|
| Email exact (Greek-normalized, lowercase) | +50 | strongest signal όταν διαθέσιμο |
| Phone exact (digits-only, post-split " - ") | +30 | δεύτερο strongest |
| Lastname Greek-normalized exact | +15 | core identity |
| Firstname Greek-normalized exact | +10 | |
| Firstname fuzzy (Levenshtein ≤ 2) | +5 | για variations (Νικολέτα/Νικολέττα) |
| Father name Greek-normalized exact | +5 | family disambiguation |
| Address token overlap | +5 | για households με ίδια διεύθυνση |

**4.2** — Threshold tiers:
- **≥ 50** → εμφανίζεται ως **primary candidate** (default-selected, top of list)
- **25-49** → εμφανίζεται ως **secondary candidate** (visible αλλά not selected)
- **< 25** → hidden by default. Manual member search fallback διαθέσιμο
  (Greek-normalized search input).

**4.3** — **Πάντα admin confirms** — even σε 100/100 match. No auto-confirm.

**4.4** — Greek normalization helper: το existing `lib/utils/greekSearch.ts`
από PR #51 (`normalizeGreek(s: string): string`). Reused για ΟΛΑ τα string
comparisons.

### 5. Phone normalization

**5.1** — Multi-phone fields (πχ `6939333782 - 6937874261 - 6937833450`):
split σε array για matching purposes.

**5.2** — Match οποιαδήποτε phone της row με `members.phone` exact (digits-only,
strip non-digit).

**5.3** — Στο UPDATE: αν `members.phone IS NULL` ή empty, set το **first** phone
της Excel row. Αν `members.phone` έχει τιμή, εμφανίζεται ως conflict στο review
panel — admin choose ποιο κρατάει.

**5.4** — Multi-phone storage out-of-scope: future enhancement αν χρειαστεί
(πιθανώς `members.phone_alt` ή jsonb).

### 6. Enrichment whitelist

**6.1 — Editable fields** (ENRICH_FIELDS):

```ts
const ENRICH_FIELDS = [
  'phone', 'birth_date', 'birthplace', 'residence',
  'address', 'occupation', 'father_name', 'mother_name',
  'maiden_name',
  'email',  // ⚠ fill-only — βλ. §6.2
] as const;
```

Mirror του existing `/api/me/[token]/update` ALLOWED_FIELDS + email.

**6.2 — Email special rule (fill-only)**:
- Αν `members.email IS NULL` ή empty → επιτρέπεται UPDATE από wizard
- Αν `members.email` έχει τιμή → conflict checkbox **disabled** στο UI με
  tooltip *"Αλλαγή email απαιτεί re-verification — γίνεται από το /members modal"*
- Αποφεύγουμε implicit `email_verified=false` reset chain

**6.3 — Explicitly excluded από enrichment** (admin-only, γραμματείας columns):
- `registry_number` (Αρ. Μητρώου) — set στο /members create flow
- `application_number` (Αρ. Αίτησης) — same
- `application_date` (Ημ/νία Αίτησης) — same
- `first_name`, `last_name` — core identity, αλλάζουν μέσω /members modal
- `member_number` — never auto-modified
- `email_verified`, `email_verification_*` — Resend flow
- `user_id`, `family_id`, `family_role` — διαφορετικά domains
- `is_board_member`, `is_president`, `is_system_admin`, `is_hub_admin`,
  `board_position` — role-related

### 7. Audit logging

**7.1** — Κάθε field-level UPDATE γράφει `audit_log` entry χρησιμοποιώντας το
existing `logChange()` helper από PR #49.

**7.2** — Existing actor label `'admin'` (no new label needed). Διάκριση γίνεται
στο `notes` field.

**7.3** — `notes` field format: `Enriched from <filename> row <N>`
(πχ `"Enriched from ΜΟΥΣΙΚΟΧΟΡΕΥΤΙΚΑ_ΤΜΗΜΑΤΑ_2025_2026.xls row 14"`)

**7.4** — Bulk operation γράφει multiple entries (όχι aggregated single entry)
ώστε history view per-member να δείχνει κανονικά.

**7.5** — Audit entry shape per row commit:

```ts
await logChange({
  clubId,
  tableName: 'members',
  recordId: matchedMemberId,
  action: 'update',
  actorLabel: 'admin',
  actorUserId: adminUserId,
  actorMemberId: adminMemberId,
  changes: computeChanges(before, after, [...ENRICH_FIELDS]),
  notes: `Enriched from ${filename} row ${rowIndex + 1}`,
});
```

### 8. Permission gate

**8.1** — Reuse existing flat permission: `permissions.includes("members")`.

**8.2** — Reasoning: το `app/members/page.tsx` ήδη χρησιμοποιεί
`permissions.includes("members")` σε **2 σημεία** (line 334 + 1105). Ο
wizard είναι μέρος του ίδιου page surface — consistent gate, single source of
truth.

**8.3** — Future tightening: όταν `/members` migrate-άρει σε `canDo("members",
"edit")` engine (PR ζ.2 pattern), ο wizard ακολουθεί στο ίδιο PR. Out of
scope τώρα.

**8.4** — UI gate: το "Εισαγωγή" button visible μόνο όταν
`canEditMembers === true` (ίδιο pattern με το existing "+ Νέο Μέλος" button).

---

## 🚫 Explicitly OUT of scope

- **New member creation** — γίνεται στο `/members` "Νέο Μέλος" κανονικά
- **Family relationships** — `ΟΝΟΜ/ΝΥΜΟ ΓΟΝΕΑ` του ΜΟΥΣΙΚΟΧΟΡΕΥΤΙΚΑ ignored
- **Class enrollment** — `ΤΜΗΜΑ` column ignored. Future: Chunk 4 dance import wizard
- **Auto-merge** — όλες οι αποφάσεις περνούν από admin
- **Resumable sessions** — αν admin κλείσει tab, χάνει progress. In-memory only.
  Future: `import_sessions` persistence αν χρειαστεί
- **Multi-file batch** — ένα Excel τη φορά
- **Pending status enum** — zero schema changes
- **Email overwrite** — μόνο fill-empty (§6.2)
- **First/last name updates** — μέσω /members modal μόνο
- **Public/QR αίτηση flow** — separate feature, μη συναφές
- **Subscribers integration** — separate domain (lead capture)

---

## 📂 Code Structure

### New files

**Library:**
- `lib/enrich/parseExcel.ts` — Excel/CSV → rows[] με column detection
- `lib/enrich/columnMapper.ts` — auto-detect logic με Greek normalization
- `lib/enrich/match.ts` — scoring algorithm + candidate retrieval
- `lib/enrich/normalize.ts` — phone splitting, date parsing με fallback formats
- `lib/enrich/types.ts` — `ExcelRow`, `MatchCandidate`, `EnrichmentDecision`, etc.

**API routes:**
- `app/api/members/enrich/match/route.ts` — POST: batch match request,
  body: { mappedRows[] }, returns candidate list per row
- `app/api/members/enrich/commit/route.ts` — POST: batch commit,
  body: { decisions[] }, executes UPDATE + audit entries

**Pages:**
- `app/members/enrich/page.tsx` — top-level wizard container με 3-step flow
- `app/members/enrich/UploadStep.tsx` — Step 1
- `app/members/enrich/MappingStep.tsx` — Step 2
- `app/members/enrich/ReviewStep.tsx` — Step 3 (η καρδιά)
- `app/members/enrich/CommitSummary.tsx` — final screen με CSV download

**Components (reusable, αν χρειαστεί):**
- `components/enrich/MatchCandidateCard.tsx`
- `components/enrich/FieldDiffPanel.tsx`

### Modified files (1 total)

- `app/members/page.tsx` — add "Εισαγωγή" button δίπλα στο "Εξαγωγή Excel"
  (line 1125, ίδιο styling pattern, αριστερά του εξαγωγή). Gate:
  `disabled={!canEditMembers}`. Click: `router.push('/members/enrich')`.

**That's it.** Καμία αλλαγή σε types.ts, audit/labels.ts, audit/log.ts —
ολόκληρο το audit foundation υπάρχει και reusable as-is.

### Dependencies

- `xlsx@0.18.5` — ήδη installed
- No new third-party deps

---

## 🧭 UX Flow (3 steps)

### Step 1 — Upload

```
┌─ /members/enrich ──────────────────────────────────┐
│ Ενημέρωση μελών από Excel                          │
│                                                     │
│ Ανέβασε αρχείο για να ενημερώσεις τα στοιχεία      │
│ υπαρχόντων μελών. Νέα μέλη δημιουργούνται από      │
│ το «Νέο Μέλος» button στη λίστα μελών.             │
│                                                     │
│ [Επιλογή αρχείου: .xlsx, .xls, .csv]               │
│                                                     │
│ Selected: ΜΟΥΣΙΚΟΧΟΡΕΥΤΙΚΑ_ΤΜΗΜΑΤΑ_2025_2026.xls   │
│ (186 KB)                                            │
│                                                     │
│                          [Ανάλυση αρχείου →]       │
└─────────────────────────────────────────────────────┘
```

Action: parse + extract column headers + first 5 rows preview.

### Step 2 — Column mapping

```
┌─ Αντιστοίχιση στηλών ──────────────────────────────┐
│ Sheet: «ΤΜΗΜΑΤΑ ΣΥΛΛΟΓΟΥ_ΟΛΑ» (82 rows)            │
│                                                     │
│ Excel column         →  SyllogosHub field          │
│ ─────────────────────────────────────────────────  │
│ ΕΠΩΝΥΜΟ              →  [Επώνυμο ▼]   ✓auto       │
│ ΟΝΟΜΑ                →  [Όνομα ▼]     ✓auto       │
│ ΟΝΟΜ/ΝΥΜΟ ΓΟΝΕΑ      →  [Αγνόηση ▼]               │
│ ΤΜΗΜΑ                →  [Αγνόηση ▼]               │
│ ΤΗΛΕΦΩΝΟ             →  [Τηλέφωνο ▼]  ✓auto       │
│ ΔΙΕΥΘΥΝΣΗ            →  [Διεύθυνση ▼] ✓auto       │
│ e - mail             →  [Email ▼]     ✓auto       │
│ ΟΚΤΩΒΡΙΟΣ            →  [Αγνόηση ▼]               │
│                                                     │
│ Preview (πρώτες 3 rows):                            │
│ ─────────────────────────────────────────────────  │
│ Αβδίκου  | Βιβή        | (κενό) | (κενό)           │
│ Αδίκογλου| Έλενα       | 697... | e.filits@...     │
│ ...                                                 │
│                                                     │
│ [← Πίσω]                          [Έλεγχος matches →]│
└─────────────────────────────────────────────────────┘
```

Action: server-side match call (POST `/api/members/enrich/match`).

### Step 3 — Review (η καρδιά)

Per-row card UI:

```
┌─ Row 6 / 82 ───────────────────────────────────────┐
│ Αντωνέλου, Νικολέττα - Αγγελική                    │
│ ☎ 6939333782 / 6937874261 / 6937833450             │
│ ✉ antoneloynikoletta@gmail.com                     │
│ 🏠 ΑΡΙΣΤΕΙΔΟΥ 83-85                                 │
│                                                     │
│ ── Πιθανά matches ──                                │
│                                                     │
│ ⦿ ΑΝΤΩΝΕΛΟΥ ΝΙΚΟΛΕΤΤΑ-ΑΓΓΕΛΙΚΗ  [score 85] ←      │
│   📞 6939333782 ✅                                  │
│   📧 (κενό)                                         │
│   🏠 (κενό)                                         │
│                                                     │
│ ○ Άλλος (ψάξε στο μητρώο...)                       │
│                                                     │
│ ○ Skip — δεν είναι κανείς από αυτούς               │
│   (θα προστεθεί στη λίστα για manual import)       │
│                                                     │
│ ── Τι θα ενημερωθεί στον επιλεγμένο ──             │
│                                                     │
│ ☑ email: (κενό) → antoneloynikoletta@gmail.com     │
│ ☑ address: (κενό) → ΑΡΙΣΤΕΙΔΟΥ 83-85               │
│ ☐ phone: 6939333782 → 6939333782 (ίδιο)            │
│                                                     │
│ [← Προηγούμενο]  [⏭ Επόμενο]  [💾 Commit όλα]      │
└─────────────────────────────────────────────────────┘
```

UI details:
- **Default-tick**: only κενά existing fields auto-ticked. Όχι overwrites.
- **Email conflict**: αν existing email υπάρχει, checkbox **disabled** με
  tooltip (§6.2). Στο review row εμφανίζεται "🔒 αλλαγή μέσω modal" inline.
- **Conflict highlighting**: existing value σε κίτρινο όταν υπάρχει + Excel value
  diff. Admin tickάρει για overwrite (όχι για email).
- **Manual search**: όταν admin επιλέγει "Άλλος", inline search input με Greek-
  normalized fuzzy match στο members table.
- **Bulk action**: "Commit όλα" κάνει commit όλων των απoφάσεων ταυτόχρονα.

### Final — Commit summary

```
┌─ Ολοκλήρωση ──────────────────────────────────────┐
│ ✅ 64 rows enriched                                │
│ ⏭ 18 rows skipped (no match ή admin skip)          │
│                                                     │
│ Audit entries: 142 (field-level changes logged)    │
│                                                     │
│ [📥 Download skipped rows CSV]                     │
│                                                     │
│ [Επιστροφή στη λίστα μελών]                        │
└─────────────────────────────────────────────────────┘
```

Skipped CSV format: όλα τα original Excel columns + νέα στήλη `_reason`
("no match above threshold" ή "admin skipped"). Filename:
`skipped_<original_filename>_<timestamp>.csv`.

---

## 🧪 Test Plan

### Phase 1 — Library smoke tests
- `parseExcel.ts`: handle .xlsx, .xls (legacy), .csv
- `normalize.ts`: phone split, date parser με 5+ formats
  (`07-12-2015`, `9-12-2012`, `3-10-2021`, `10-1-11`, ISO `2019-09-15`)
- `match.ts`: scoring sanity (perfect match → 100, no match → 0)

### Phase 2 — Match endpoint
- Mock dataset με known matches → expected candidates returned
- Threshold filtering works (≥25 surfaced, <25 hidden)
- Manual search fallback returns Greek-normalized matches
- Permission gate: non-`members` users → 403

### Phase 3 — Commit endpoint
- Successful enrichment → members row updated + audit entries created
- Field whitelist enforced (try POST με `first_name` → rejected silently)
- Email fill-only enforced (try overwrite existing email → ignored, no audit entry)
- Audit notes include filename + row number
- Skipped CSV download works (correct filename + headers)

### Phase 4 — End-to-end smoke (with real ΜΟΥΣΙΚΟΧΟΡΕΥΤΙΚΑ file)
- Upload + parse — 82 rows
- Auto-mapping detects all 5 known columns (ΕΠΩΝΥΜΟ, ΟΝΟΜΑ, ΤΗΛΕΦΩΝΟ,
  ΔΙΕΥΘΥΝΣΗ, e-mail) — 3 columns auto-set to "Αγνόηση"
- Review screen iterable + commit reflects σε `/members` immediately
- Audit log shows new entries με `actor='admin'` + notes με filename
- Skipped CSV contains expected rows

### Phase 5 — Edge cases
- Empty Excel file → graceful error
- 0 columns mapped → "Επόμενο" disabled
- 0 candidates for row → only Skip option visible
- All overwrite conflicts unticked → no-op commit ("0 changes")
- Greek search μέσω manual fallback (πχ exact-Greek "ΧΡΟΝΑΚΗΣ")
- Existing email row + email column mapped → checkbox disabled UI works

---

## 📋 Commit Plan (5 commits)

| # | Commit | Files | Notes |
|---|---|---|---|
| 1 | `feat(enrich): library — parsing + matching + normalization` | lib/enrich/* | Pure functions, unit-testable |
| 2 | `feat(enrich): API match endpoint` | app/api/members/enrich/match/* | Server-side scoring |
| 3 | `feat(enrich): API commit endpoint + audit hooks` | app/api/members/enrich/commit/* | Uses existing logChange() |
| 4 | `feat(enrich): wizard UI (4 steps + summary)` | app/members/enrich/* | Full flow |
| 5 | `feat(enrich): /members toolbar "Εισαγωγή" button + ROADMAP sync` | app/members/page.tsx + ROADMAP | Integration + docs |

ROADMAP sync σε final commit του PR.

---

## 📝 Linkage με ROADMAP

### New entry to add (post-PR merge)

Στο 🟡 High Priority → "Members domain" section:

```
- [x] **🟡 Generic Excel cross-reference enrichment wizard**
  ✅ Delivered PR #XXX (date)
  Generic wizard για enrich existing members από οποιοδήποτε
  σκόρπιο Excel/CSV. Manual yes/no per row, manual yes/no per
  field. Skipped rows exported ως CSV για manual handling στο
  /members. New member creation explicitly out of scope (separation
  of concerns). Foundation για future bulk enrichment workflows.
```

### Related future entries (post-merge)

- **🟢 Dance enrollment import** (Chunk 4) — separate wizard για
  ΜΟΥΣΙΚΟΧΟΡΕΥΤΙΚΑ format που auto-enrolls members σε classes.
  Reuses matching engine από `lib/enrich/match.ts`.
- **🟢 Multi-phone storage** — `members.phone_alt` column ή jsonb array
  για households που μοιράζονται σταθερό αλλά έχουν δικά τους κινητά.
- **🟢 Resumable enrichment sessions** — `import_sessions` table για
  paused/resumed admin reviews >100 rows.
- **🟢 Email overwrite με auto re-verification** — όταν member portal
  re-verification flow γίνει polished, να γίνει unlock το email
  overwrite στο wizard.

---

## 📨 Επόμενο βήμα

Όταν approve:

1. Branch creation: `git checkout -b feat/member-enrich-wizard`
2. Pre-flight: ✅ confirmed `xlsx@0.18.5` installed
3. Commit 1 (library — pure functions, no DB)
4. STOP-before-push για review
5. Commit 2-5 σε σειρά, με STOP πριν από κάθε push
