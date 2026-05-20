# Member Enrichment — Family Signal Detection
# CSV annotation για skipped rows που πιθανόν ανήκουν σε υπάρχουσα οικογένεια

> Last updated: 2026-05-20
> Branch: `feat/enrich-family-signal`
> Estimated: M (1 PR, 4 commits, zero migrations)
> Builds on: PR #102 (enrichment wizard), PR #103-#106 (polish queue)
> Connects με: `MEMBER_ENRICH_PLAN.md` (parent plan — §1 scope lock stays)

---

## 1. Motivation

Στο testing του PR #102 με το πραγματικό dataset `ΜΟΥΣΙΚΟΧΟΡΕΥΤΙΚΑ_ΤΜΗΜΑΤΑ`
αποκαλύφθηκε ένα systemic pattern: **family clusters**.

Σε ένα Greek σύλλογο τα μέλη συχνά εγγράφονται μαζί ως οικογένειες — γονείς
+ παιδιά + παππούδες. Συνέπεια στα data:

- **Same lastname + same address** εμφανίζεται σε notable fraction των
  rows που δεν matchάρανε (parents + children που το ένα μέλος είναι
  ήδη εγγεγραμμένο, το άλλο όχι).
- **Father/mother name == existing member first_name** δείχνει direct
  parent-child relationship σε meaningful subset των skipped rows.
- **Shared landline phone + lastname** identifies cohabiting spouses.

**Το πρόβλημα**: ο wizard κάνει skip χωρίς context. Ο admin βλέπει στο CSV
μόνο "row 47 — ΠΑΠΑΔΟΠΟΥΛΟΣ ΝΙΚΟΛΑΟΣ — admin_skipped" και δεν έχει σήμα
ότι αυτός είναι **παιδί** του ήδη εγγεγραμμένου ΠΑΠΑΔΟΠΟΥΛΟΥ ΓΕΩΡΓΙΟΥ
που μένει στην ίδια διεύθυνση. Manual follow-up γίνεται χρονοβόρο ή
παραλείπεται εντελώς.

**Η λύση**: server-side detection των family relationships κατά το
matching pass και annotation στο skipped CSV με νέα στήλη
`_likely_family_of`. Ο admin βλέπει immediately ποιες "skipped" rows
συνδέονται με existing members και προγραμματίζει manual creation με
context.

---

## 2. Scope

### In-scope (v1)

- **Server-side detection** στο `/api/members/enrich/match` endpoint —
  parallel computation αλόνgside `rankCandidates`.
- **State carry-through** από review state μέχρι summary state.
- **CSV annotation** στο skipped CSV download — νέα στήλη
  `_likely_family_of` με top-3 hints.
- **5 heuristic rules** (§3) covering τα συχνότερα family patterns.
- **Top-N ranking** ανά row, sorted by score desc.
- **Localized signal labels** στα ελληνικά για admin readability.

### Out-of-scope (v1)

- **ReviewCard UI surfacing** — no visual chips/badges στο review step.
  Ο admin βλέπει family hints **μόνο στο CSV** μετά το commit. Deferred
  σε future iteration αν χρειαστεί.
- **Scoring tuning** — όλοι οι rules έχουν equal weight (50 points).
  Empirical tuning deferred.
- **Disambiguation logic** — αν ένα row hits πολλαπλούς members με
  ίδιο score, και τα δύο εμφανίζονται. No tiebreaker.
- **Non-family negative signals** — δεν προσπαθούμε να αποκλείσουμε
  false positives (πχ "ΜΑΡΙΑ" common name → many fake matches).
  Compound rules (§3 R5) provide partial defense.
- **New member auto-creation** — explicitly forbidden by parent plan
  `MEMBER_ENRICH_PLAN.md` §1 lock.

### Parent plan lock preserved

> **`MEMBER_ENRICH_PLAN.md` §1**: ο wizard **ΠΟΤΕ** δεν δημιουργεί νέα
> μέλη. New member creation παραμένει στο `/members` "Νέο Μέλος" flow.

Family hint **annotates** το CSV. Δεν δημιουργεί. Δεν συνδέει automatically.
Δεν τροποποιεί το existing member record. Είναι **διαγνωστικό σήμα μόνο**.

---

## 3. Heuristic Rules (5)

Όλοι οι string comparisons περνάνε από `normalizeGreek` (lowercase + NFD
strip combining marks + final sigma) για case/accent tolerance. Address
matching reuses το existing `tokenize()` helper του `lib/enrich/match.ts`
(token overlap ≥ 3 chars).

| Rule | Fires όταν | Suggests | Score |
|---|---|---|---|
| **R1** — `surname_address` | `lastname_exact` AND `address_overlap` | spouse, sibling, ή child living at home | 50 |
| **R2** — `address_phone` | `address_overlap` AND `phone_exact` | cohabiting family (landline shared) | 50 |
| **R3** — `father_name_match` | `row.father_name == member.first_name` AND `lastname_exact` | row είναι **παιδί** αυτού του member | 50 |
| **R4** — `mother_name_match` | `row.mother_name == member.first_name` | row είναι **παιδί** αυτού του member (από μητέρα) | 50 |
| **R5** — `firstname_matches_member_mother` | `row.first_name == (member.mother_name OR member.maiden_name)` AND (`lastname_exact` OR `address_overlap`) | row **είναι η μητέρα** του existing member | 50 |

### Rule rationale

**R1** — Το πιο συχνό family signal στο dataset. Σύζυγοι κρατάνε surname
+ μένουν μαζί (Greek civil convention). Άρα row και member μοιράζονται.

**R2** — Landline phone shared = strong cohabitation signal. Mobile phones
ΠΟΤΕ δεν τικάρει αυτή τη rule εφόσον member.phone αποθηκεύεται single
field (no multi-phone storage per parent plan §5.4).

**R3** — Direct parent-child detection. Row's father_name field είναι το
όνομα του πατέρα. Αν αυτό ταιριάζει με member.first_name + οι δύο έχουν
ίδιο surname → ο member είναι ο πατέρας.

**R4** — Mirror του R3, αλλά mother side. **No lastname requirement** —
μητέρα συχνά έχει διαφορετικό surname (maiden vs married). Compensating
με higher confidence requirement: το mother_name field είναι rarer
populated → όταν υπάρχει, signal-to-noise καλύτερο.

**R5 — COMPOUND ON PURPOSE**. Πιο τρικιάρικη rule. Common Greek first
names ("ΜΑΡΙΑ", "ΕΛΕΝΗ", "ΓΕΩΡΓΙΑ") θα έδιναν τόνους false matches αν
fired solo. Compound rule designed to suppress common-name false
positives (πχ 'ΜΑΡΙΑ' alone) by requiring `lastname_exact` OR
`address_overlap` to co-fire.

### Score uniformity

Όλοι οι rules έχουν +50. Reasoning:
- Έκαστος rule είναι meaningful (όχι noise)
- Empirical scoring tuning είναι deferred — risky χωρίς more data
- Δίνοντας equal weight, top-N ranking driven by **how many rules fire**,
  not by guessed weights. Ένα member που hits R1+R3 (100 points) είναι
  more likely family than ένα που hits μόνο R5 (50 points). Natural.

Total max score: 250 (όλα fire). No cap — όσο μεγαλύτερο score, τόσο
ισχυρότερο signal.

---

## 4. Algorithm

### Function signature

```ts
// lib/enrich/family.ts
export function detectFamilyCandidates(
  row: NormalizedExcelRow,
  members: MatchableMember[],
): FamilyHint[];
```

### Logic outline

```
for each member in members:
  signals = []
  score = 0

  if lastname_exact(row, member):
    if address_overlap(row, member):
      signals.push('surname_address'); score += 50
    if row.father_name == member.first_name:
      signals.push('father_name_match'); score += 50

  if address_overlap(row, member):
    if phone_exact(row, member):
      signals.push('address_phone'); score += 50

  if row.mother_name == member.first_name:
    signals.push('mother_name_match'); score += 50

  // R5 compound
  if row.first_name == member.mother_name OR row.first_name == member.maiden_name:
    if lastname_exact(row, member) OR address_overlap(row, member):
      signals.push('firstname_matches_member_mother'); score += 50

  if score > 0:
    push { memberId: member.id, score, signals } to results

return results.sort((a, b) => b.score - a.score).slice(0, 3)
```

### Reuse

- `normalizeGreek` from `lib/utils/greekSearch` — όλες οι string equalities
- `tokenize` from `lib/enrich/match` (NEW export, μέχρι τώρα internal) —
  address overlap detection
- `digitsOnly` from `lib/enrich/normalize` — phone exact match
- `MatchableMember` from `lib/enrich/match` — type contract
- `NormalizedExcelRow` from `lib/enrich/types`

### Performance

Per match request: `O(rows × members × rules)`. For PR #102 dataset
(203 rows × 244 members × 5 rules) ≈ 248k operations. Sub-millisecond
expected — well within match endpoint's existing budget. Same data
already loaded for `rankCandidates`, so zero additional DB cost.

---

## 5. API contract

### New types (`lib/enrich/types.ts`)

```ts
export type FamilySignal =
  | "surname_address"
  | "address_phone"
  | "father_name_match"
  | "mother_name_match"
  | "firstname_matches_member_mother";

export type FamilyHint = {
  memberId: string;
  score: number;
  signals: FamilySignal[];
};
```

### New library file (`lib/enrich/family.ts`)

Exports:
- `detectFamilyCandidates(row, members): FamilyHint[]` — main entry point

### Modified library file (`lib/enrich/match.ts`)

Adds:
- `export function tokenize(s: string): string[]` — promote από internal
  helper σε public export. Single source of truth για address tokenization.

### Extended response (`app/api/members/enrich/match/route.ts`)

```ts
type PerRowResponse = {
  rowIndex: number;
  candidates: MatchCandidate[];
  familyHints: FamilyHint[];  // NEW — top 3, sorted desc, empty if no signals
};
```

Computation site: λίγο after `rankCandidates`, ίδιο loop:

```ts
const perRow: PerRowResponse[] = mappedRows.map((row) => {
  const ranked = rankCandidates(row, matchable);
  const candidates = ranked
    .filter((c) => c.score >= MATCH_THRESHOLD_SECONDARY)
    .slice(0, CANDIDATES_PER_ROW);
  const familyHints = detectFamilyCandidates(row, matchable);  // NEW
  return { rowIndex: row.rowIndex, candidates, familyHints };
});
```

---

## 6. State machine impact

### `app/members/enrich/_state.ts` changes

**`WizardAction.MATCH_LOADED`** gains:
```ts
| {
    type: "MATCH_LOADED";
    normalizedRows: NormalizedExcelRow[];
    perRow: MatchedRow[];
    allMembers: MatchableMember[];
    familyHintsByRow: Map<number, FamilyHint[]>;  // NEW
  }
```

**`WizardState.review`** gains:
```ts
| {
    step: "review";
    ...existing fields...
    familyHintsByRow: Map<number, FamilyHint[]>;  // NEW
  }
```

**`WizardState.summary`** gains:
```ts
| {
    step: "summary";
    ...existing fields...
    familyHintsByRow: Map<number, FamilyHint[]>;  // NEW
  }
```

### Reducer updates

**`MATCH_LOADED` case** — builds the Map από response perRow:
```ts
case "MATCH_LOADED": {
  ...
  const familyHintsByRow = new Map<number, FamilyHint[]>();
  for (const r of perRow) {
    if (r.familyHints && r.familyHints.length > 0) {
      familyHintsByRow.set(r.rowIndex, r.familyHints);
    }
  }
  return {
    step: "review",
    ...
    familyHintsByRow,
  };
}
```

**`COMMIT_DONE` case** — forwards through:
```ts
case "COMMIT_DONE": {
  if (state.step !== "review") return state;
  return {
    step: "summary",
    filename: state.filename,
    result: action.result,
    normalizedRows: state.normalizedRows,
    familyHintsByRow: state.familyHintsByRow,  // NEW forward
  };
}
```

### Dispatch site

**`app/members/enrich/MappingStep.tsx`** — που γίνεται το dispatch του
MATCH_LOADED μετά το fetch response, παίρνει το `familyHintsByRow` από
response. Likely shape:

```ts
dispatch({
  type: "MATCH_LOADED",
  normalizedRows,
  perRow: response.perRow.map(...) // existing shape
  allMembers: response.allMembers,
  familyHintsByRow: response.perRow.reduce((map, r) => {
    if (r.familyHints?.length) map.set(r.rowIndex, r.familyHints);
    return map;
  }, new Map<number, FamilyHint[]>()),
});
```

(Final shape decided σε commit 3.)

---

## 7. CSV format

### Header extension (`SummaryStep.tsx`)

```ts
const allHeaders = [...headers, "_reason", "_likely_family_of"];  // NEW column
```

### Per skipped row cell content

Empty string αν δεν υπάρχουν family hints για το row.

Αλλιώς: top-3 hints, semicolon-separated (`;` δεν είναι CSV delimiter →
no escape needed), each formatted:

```
LASTNAME FIRSTNAME [σήμα1+σήμα2]; LASTNAME2 FIRSTNAME2 [σήμα3]; ...
```

Example output:
```
ΠΑΠΑΔΟΠΟΥΛΟΣ ΓΕΩΡΓΙΟΣ [επώνυμο+διεύθυνση+πατρώνυμο]; ΠΑΠΑΔΟΠΟΥΛΟΥ ΕΛΕΝΗ [επώνυμο+διεύθυνση]
```

### Greek label mapping

```ts
const FAMILY_SIGNAL_LABELS: Record<FamilySignal, string> = {
  surname_address: "επώνυμο+διεύθυνση",
  address_phone: "διεύθυνση+τηλέφωνο",
  father_name_match: "πατρώνυμο",
  mother_name_match: "μητρώνυμο",
  firstname_matches_member_mother: "όνομα=μητέρα",
};
```

Brackets `[...]` + `+` separator chosen ώστε:
- Visual scan-ability (brackets isolate signal from name)
- No conflict με CSV escaping (no commas, no quotes)
- Multiple signals για ίδιο member compactly displayed

### Helper function

`formatFamilyHints(hints: FamilyHint[], allMembers: MatchableMember[]): string`
σε SummaryStep — pure function, takes hints + member lookup, returns
formatted CSV cell content.

**Wait** — SummaryStep state doesn't carry `allMembers` (dropped από
review→summary transition). We need name lookup at CSV time. Options:
- (a) Embed name in FamilyHint at construction time (server-side):
  add `memberName: string` field στο FamilyHint type
- (b) Carry `allMembers` through summary state
- (c) Look up member name once on client at MATCH_LOADED time, store
  pre-formatted in state

**Decision**: option (a). Server-side embed of `memberName` keeps state
machine simple (no extra allMembers carry), keeps CSV formatter pure (no
async lookup), και adds modest payload (name + ID per hint × top-3 × N
rows). Updated FamilyHint:

```ts
export type FamilyHint = {
  memberId: string;
  memberName: string;  // "LASTNAME FIRSTNAME" pre-formatted
  score: number;
  signals: FamilySignal[];
};
```

---

## 8. Implementation plan (4 commits)

### Commit 1 — Library + tokenize export

**Files**:
- `lib/enrich/family.ts` (new, ~80 lines)
- `lib/enrich/match.ts` (~3 lines: `function tokenize` → `export function tokenize`)
- `lib/enrich/types.ts` (~15 lines: add `FamilySignal`, `FamilyHint` types)

**Smoke**: `tsc --noEmit`, `eslint lib/enrich/`.

**No state machine impact**, no API impact yet. Library standalone.

### Commit 2 — API integration

**Files**:
- `app/api/members/enrich/match/route.ts`
  - Import `detectFamilyCandidates`, `FamilyHint`
  - Extend `PerRowResponse` type
  - Call detection σε map loop (~5 lines)
  - Look up member name + embed σε FamilyHint (per §7 decision)

**Smoke**: `tsc --noEmit`, `eslint app/api/`.

Network compatibility: existing clients ignore new field naturally (no
breaking change). Old client + new server = graceful.

### Commit 3 — State carry-through

**Files**:
- `app/members/enrich/_state.ts`
  - `WizardAction.MATCH_LOADED` adds `familyHintsByRow`
  - `WizardState.review` and `summary` add `familyHintsByRow`
  - `MATCH_LOADED` reducer builds Map
  - `COMMIT_DONE` reducer forwards
  - Import `FamilyHint` from types
- `app/members/enrich/MappingStep.tsx` (or wherever the MATCH_LOADED
  dispatch lives — TBD κατά review)
  - Build Map από response και pass στο dispatch action

**Smoke**: `tsc --noEmit`, `eslint app/members/enrich/`.

### Commit 4 — CSV annotation

**Files**:
- `app/members/enrich/SummaryStep.tsx`
  - Add `_likely_family_of` σε `allHeaders`
  - Add `FAMILY_SIGNAL_LABELS` const map
  - Add `formatFamilyHints` helper
  - Per skipped row: pull hints from `state.familyHintsByRow`, format,
    push σε cells

**Smoke**: `tsc --noEmit`, `eslint app/members/enrich/`.

**Manual verification step**: download CSV από test enrichment, inspect
`_likely_family_of` column για sample skipped rows. Confirm:
- Empty για rows χωρίς family hints
- Properly formatted multi-hint cells
- Greek labels rendered correctly (UTF-8 BOM existing prefix handles)

### PR

After commit 4 lands clean, single PR `feat/enrich-family-signal` →
`main`. Body summarizes 4 commits, references PR #102-#106 polish
queue ancestry, and embeds the §3 rules table for at-a-glance review.
