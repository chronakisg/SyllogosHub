# Payments Audit — Phase B Plan
# PATCH endpoint + Approval RPCs + Audit Dualism Resolution

> Last updated: 2026-05-11
> Branch (proposed): `feat/payments-audit` (μετά το merge του plan PR)
> Estimated: L (multi-session — split σε Β.1a / Β.1b / Β.1c)
> Connects με: PR #60 (events audit foundation), payment_deletion_audit
> table, multi-tenant onboarding (PR #31/#32)

---

## 🎯 Στόχος

Επεκτείνει το cross-table audit foundation (Phase A, events) στο
finances domain — συγκεκριμένα στο `payments` table που είναι το
core financial entity. Φτιάχνει pattern που θα reuse-αριστεί σε
sponsors, expenses, reservations (Phases C/D).

Όλες οι αρχιτεκτονικές αποφάσεις σχεδιάζονται **N-club-ready**:
δεν υπάρχει per-club customization, ad-hoc workaround, ή feature
gating ανά πελάτη. Όταν ανοίγει νέος σύλλογος μέσω super admin
panel (PR #31/#32), audit infrastructure πρέπει να δουλεύει
**out of the box** χωρίς manual setup.

Δεν λύνει: bulk payment delete audit (παραμένει στο
`payment_deletion_audit` table — βλ. Decision 3). Δεν λύνει: RLS
policies για audit_log (production blocker, separate work).

---

## 🏗️ Locked Decisions (5)

### Endpoint Design

**1.1 — Split σε δύο endpoint families**

- **PATCH `/api/finances/payments/[id]`** (Phase B.1a):
  Generic field editing. Field whitelist: `amount`, `payment_date`,
  `type`, `period`, `original_amount`. Mirror του `PATCH /api/events/[id]`
  από PR #60. Audit action: `update` (generic).
- **POST `/api/finances/payments/[id]/approve`** + **`/reject`**
  (Phase B.1b): Semantic operations με discriminated audit actions
  (`payment.approved`, `payment.rejected`). Server-side state machine
  validation (e.g. δεν approve-άρεται ήδη rejected payment).

**Γιατί δύο families:**
- PATCH κρατάει generic update semantics — εύκολη επέκταση σε νέα
  fields χωρίς νέα endpoints
- Approve/reject είναι state transitions, όχι field updates — RPC
  shape είναι semantically καθαρότερο (mirror του `email_verified`
  discriminated action από PR #56)
- Audit log γίνεται queryable per-action ("πόσα approvals έγιναν
  σήμερα" χωρίς να filter-άρεις field diffs)

### Approval Workflow

**2.1 — `approval_status` δεν είναι editable μέσω PATCH**

PATCH endpoint **απορρίπτει** `approval_status` στο whitelist. State
transitions γίνονται **μόνο** μέσω RPC endpoints. Αυτό αποτρέπει
silent approval status changes που bypass-άρουν το discriminated
audit action.

**2.2 — `override_reason` server-side merge για reject flow**

Σήμερα στο `approvals/page.tsx`:
```ts
const newReason = existing
  ? `${existing} | ΑΠΟΡΡΙΨΗ: ${reason}`
  : `ΑΠΟΡΡΙΨΗ: ${reason}`;
```

Race-prone αν 2 admins reject ταυτόχρονα — ο δεύτερος διαβάζει stale
`existing` και κάνει overwrite. Server-side merge inside transaction
fixes αυτό:

```ts
// Inside POST /api/finances/payments/[id]/reject
const before = await select('override_reason')
const merged = before?.override_reason
  ? `${before.override_reason} | ΑΠΟΡΡΙΨΗ: ${input.reason}`
  : `ΑΠΟΡΡΙΨΗ: ${input.reason}`
await update({ override_reason: merged, ... })
```

**Δεν** προσθέτουμε version column / optimistic concurrency. 1-2 admin
users per club καθιστά concurrent rejects θεωρητικό σενάριο.
Document ως known limitation, revisit μόνο αν προκύψει σε real usage.

**2.3 — Approve flow ΔΕΝ αγγίζει override_reason**

Approve κάνει transition `pending → approved` με `approved_by` +
`approved_at`. Δεν τροποποιεί override_reason. Αν payment είχε prior
rejection history, παραμένει για audit visibility.

### Audit Dualism Resolution

**3.1 — Co-existence με clear boundaries (Option γ)**

| Mutation type | Audit destination | Reason |
|---|---|---|
| Single-row PATCH (amount/date/type/period change) | `audit_log` (generic, field diff) | Mirror του events pattern |
| Single-row approve/reject | `audit_log` (discriminated action, no field diff) | Mirror του email_verified pattern |
| Single-row delete (από drill-down UI) | `audit_log` (action='delete', changes=null) | Generic delete pattern |
| **Bulk batch delete** (από batch UI) | `payment_deletion_audit` (existing) | Semantically richer fields: `payments_snapshot`, `had_approved_payments`, `payment_count`, `total_amount` |

**Rationale:**
- `payment_deletion_audit.payments_snapshot` (jsonb με full batch) είναι
  domain-specific signal που δεν χωράει σε generic `audit_log.changes`
- Forcing unification = bloated generic schema για όλους τους clubs
- Co-existence με ξεκάθαρα boundaries (single-row → generic, batch →
  specialized) είναι maintainable και extensible

**3.2 — Eventually-consistent dual visibility**

`/audit-log` page (PR #51) είναι generic-only. `payment_deletion_audit`
queries γίνονται από `/finances` drill-down UI. **Όχι** unification
στο UI layer — οι δύο surfaces εξυπηρετούν διαφορετικά mental models.

Cross-linking στο future: αν user βλέπει delete entry στο audit_log,
link στο payment_deletion_audit entry (αν υπάρχει batch context).
Phase B.1c scope.

### Discriminated Audit Actions

**4.1 — Νέες audit actions: `payment.approved`, `payment.rejected`**

CHECK constraint expansion στο `audit_log.action`:

```sql
-- Migration 0024
alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check
  check (action in (
    'create', 'update', 'delete',           -- generic
    'email_verified',                        -- existing (PR #56)
    'payment.approved', 'payment.rejected'   -- new
  ));
```

**Naming convention:** `<entity>.<event>` για discriminated actions.
Mirror του namespacing pattern (events-style). Generic actions
παραμένουν χωρίς prefix (`update`, `delete`).

**4.2 — Payload structure για discriminated payment actions**

```ts
// payment.approved
{
  action: 'payment.approved',
  changes: null,  // state transition, no field diff
  notes: null     // optional: future use για approver comments
}

// payment.rejected
{
  action: 'payment.rejected',
  changes: null,
  notes: rejectReason  // user-provided reason (separate από override_reason
                       // merge — αυτό είναι structured για queries)
}
```

`notes` column expansion αξιοποιείται για human-readable context που
δεν χωράει σε `changes` jsonb. Καθαρότερο από forcing reject reason
στο changes payload.

### Permission Gating

**5.1 — `requirePermission('finances')` για όλα τα endpoints**

PATCH + approve + reject + delete: **όλα** finances permission. Δεν
υπάρχει discrimination (π.χ. "οποιοσδήποτε μπορεί να approve, μόνο
admin μπορεί να reject"). Πρόεδρος + ταμίας έχουν την ίδια authority
στο schema-level — UX-level differentiation αν χρειαστεί, γίνεται
client-side.

**5.2 — Multi-tenant scoping σε όλες τις queries**

Mirror του PR #60 pattern: `.eq('id', id).eq('club_id', resolvedClubId)`
σε **κάθε** SELECT/UPDATE. Defense-in-depth: αποτρέπει cross-club
mutation ακόμα και αν permission gate παρακαμφθεί.

---

## 📦 Schema Migrations

### Migration 0024 — `audit_log.action` CHECK expansion

```sql
-- 1. Snapshot (defensive — table είναι μικρό, fast clone)
create table public.audit_log_backup_20260511_pre_payments as
  select * from public.audit_log;

-- 2. Drop old constraint
alter table public.audit_log
  drop constraint audit_log_action_check;

-- 3. Add expanded constraint
alter table public.audit_log
  add constraint audit_log_action_check
  check (action in (
    'create', 'update', 'delete',
    'email_verified',
    'payment.approved', 'payment.rejected'
  ));

-- 4. RLS check (παραμένει disabled — consistent με project pattern)
-- (No change needed)

-- Verification queries (run after):
-- a. Constraint check
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.audit_log'::regclass
  and conname = 'audit_log_action_check';
-- Expected: includes 'payment.approved', 'payment.rejected'

-- b. Existing data unchanged
select count(*), count(distinct action) from public.audit_log;

-- c. Try inserting old action (should still work)
-- insert into audit_log (table_name, record_id, action, club_id)
--   values ('test', gen_random_uuid(), 'update',
--           (select id from clubs limit 1));
-- Then: delete from audit_log where table_name = 'test';
```

**Σημείωση:** Δεν χρειάζεται data migration. Existing entries
παραμένουν unchanged. Future entries με νέες actions θα pass-άρουν
το expanded check.

---

## 📂 Code Structure

### New files

**API endpoints (Phase B.1a + B.1b):**
- `app/api/finances/payments/[id]/route.ts` — PATCH method
- `app/api/finances/payments/[id]/approve/route.ts` — POST method
- `app/api/finances/payments/[id]/reject/route.ts` — POST method

**Audit labels:**
- Extension στο `lib/audit/labels.ts`:
  - `PAYMENT_FIELD_LABELS` (Record): amount, payment_date, type,
    period, original_amount → Greek labels
  - `AUDIT_ACTION_LABELS` expansion: 'payment.approved' →
    'Έγκριση πληρωμής', 'payment.rejected' → 'Απόρριψη πληρωμής'

**Audit helpers (optional, αξιολογείται κατά την υλοποίηση):**
- `lib/audit/log.ts` ίσως προσθέσει `logPaymentApproved()` +
  `logPaymentRejected()` wrappers (mirror του `logEmailVerified`)
  για consistency. Decision deferred σε implementation time.

### Modified files

**Types (hand-crafted):**
- `lib/supabase/types.ts`:
  - `AuditAction` union extension: `'payment.approved' | 'payment.rejected'`
  - Auto-propagates σε `LogChangeEntry` + `AuditLog Row/Insert/Update`

**Client sites (Phase B.1b client migration):**
- `app/finances/approvals/page.tsx`:
  - L85-91: replace `.update({approval_status: 'approved', ...})` με
    `fetch('/api/finances/payments/[id]/approve', { method: 'POST' })`
  - L120-127: replace reject `.update({...})` με
    `fetch('/api/finances/payments/[id]/reject', { method: 'POST',
    body: JSON.stringify({reason}) })`
  - Client-side string merge logic **διαγράφεται** (server κάνει merge)

**Phase B.1a client migration (deferred σε separate commit ή PR):**
- `app/finances/page.tsx`: L526, L912-913 (payments inserts/updates)
- Note: insert flow είναι **εκτός scope** Phase B.1 — γίνεται Phase B.2

---

## 📋 Commit Plan

### Phase B.1a — PATCH endpoint (6 commits, single PR)

| # | Commit | Files | Notes |
|---|---|---|---|
| 1 | `feat(schema): migration 0024 audit_log action expansion` | migration file + SQL doc | Manual SQL πρώτα, snapshot backup |
| 2 | `feat(types): AuditAction expansion για payment actions` | `lib/supabase/types.ts` | Hand-crafted edit |
| 3 | `feat(audit): PAYMENT_FIELD_LABELS + action labels` | `lib/audit/labels.ts` | Greek translations |
| 4 | `feat(api): PATCH /api/finances/payments/[id] με audit hook` | new API route | Mirror του PR #60 events pattern |
| 5 | `feat(finances): migrate approvals/page.tsx σε API` | client refactor | Replace direct .update calls |
| 6 | `docs(roadmap): PR #XX recap + Phase B split` | `ROADMAP.md` | Phase B.1a done, B.1b/c pending |

**Estimated:** 4-6 ώρες (one session αν φουλ ενέργεια, αλλιώς split σε 2)

### Phase B.1b — Approval RPCs (5 commits, separate PR)

| # | Commit | Files | Notes |
|---|---|---|---|
| 1 | `feat(audit): logPaymentApproved + logPaymentRejected helpers` | `lib/audit/log.ts` | Wrappers με defaults |
| 2 | `feat(api): POST /api/finances/payments/[id]/approve` | new API route | State transition + audit |
| 3 | `feat(api): POST /api/finances/payments/[id]/reject` | new API route | Server-side override_reason merge |
| 4 | `feat(finances): migrate approve/reject client logic` | `app/finances/approvals/page.tsx` | Remove client-side string merge |
| 5 | `docs(roadmap): Phase B.1b recap` | `ROADMAP.md` | |

**Estimated:** 3-4 ώρες (one session)

### Phase B.1c — Single-row delete + cross-linking (deferred)

Out of scope για το pre-launch effort. Tracked στο ROADMAP για μελλοντική session.

---

## 🔐 Security Considerations

### Permission gating

Όλα τα 3 endpoints (`PATCH`, `approve`, `reject`) χρησιμοποιούν
`requirePermission('finances')`. Mirror του PR #60 pattern. Short-circuit
για admin/president, surfaces DB errors as 500 (vs silent ignore).

### Multi-tenant scoping

Defense-in-depth: `.eq('id', id).eq('club_id', resolvedClubId)` σε **κάθε**
SELECT/UPDATE. Cross-club mutation αποτρέπεται ακόμα και αν `id` είναι
guessable.

### State machine validation (Phase B.1b)

Approve endpoint **απορρίπτει** αν `approval_status != 'pending'`:
```ts
if (existing.approval_status === 'approved') {
  return errorResponse('Η πληρωμή είναι ήδη εγκεκριμένη', 409)
}
if (existing.approval_status === 'rejected') {
  return errorResponse('Η πληρωμή έχει απορριφθεί', 409)
}
```

Reject endpoint **επιτρέπει** transition από οποιοδήποτε state — π.χ.
ένας πρόεδρος μπορεί να ακυρώσει approved πληρωμή με reason. Audit
καταγράφει όλες τις transitions, ώστε να υπάρχει trail.

### Input validation

**PATCH whitelist:**
- `amount`: number, finite, >= 0
- `payment_date`: ISO date string, parseable
- `type`: enum value από PaymentType union
- `period`: string, trimmed, max length
- `original_amount`: number, finite, >= 0 ή null

**Reject input:**
- `reason`: non-empty string, trimmed, max 500 chars (sane limit για merge)

### Idempotency

Approve/reject **δεν** είναι idempotent by design:
- Αν approve-άρεις twice, το δεύτερο επιστρέφει 409 (already approved)
- Αν reject-άρεις twice με διαφορετικό reason, το δεύτερο **κάνει append**
  στο override_reason (intentional — multiple rejections με διαφορετικούς
  λόγους έχουν audit value)

### Audit hook fail-soft

Mirror του PR #56/#60 pattern: audit failure δεν blocker-άρει user
operation. Σιωπηλά logged, no toast/error στον user. Trade-off:
audit gaps possible σε rare DB failures, αλλά user trust > audit
completeness.

---

## 🧪 Test Plan

### Phase 1 — Migration (manual SQL)

1. Snapshot ✅ (`audit_log_backup_20260511_pre_payments`)
2. Drop constraint ✅ (`audit_log_action_check`)
3. Add expanded constraint ✅
4. Verification query a (constraint definition): includes new actions ✅
5. Verification query b (data unchanged): count matches pre-migration ✅
6. Verification query c (old action still accepted): insert+delete test ✅

### Phase 2 — PATCH endpoint (Phase B.1a)

**Happy path:**
1. PATCH `/api/finances/payments/[valid-id]` με amount change → 200 + audit row
2. PATCH με payment_date change → 200 + audit row με field diff
3. PATCH με multiple fields → 200 + audit row με όλα τα diffs
4. PATCH με empty body → 200, no DB update, no audit row (empty diff skip)

**Validation:**
5. PATCH με negative amount → 400 με Greek message
6. PATCH με invalid payment_date format → 400
7. PATCH με `approval_status` field → 400 'Κανένα έγκυρο field' (whitelist)
8. PATCH με unknown field → 400 ίδιο message

**Auth:**
9. PATCH χωρίς session → 401
10. PATCH με session αλλά χωρίς finances permission → 403
11. PATCH cross-club (id ανήκει σε άλλο club) → 404 (not 403 — leakage prevention)

**Edge:**
12. PATCH non-existent id → 404
13. Concurrent PATCH από 2 sessions → both succeed, last write wins (acceptable)

### Phase 3 — Approve endpoint (Phase B.1b)

**Happy path:**
1. POST `/approve` σε pending payment → 200 + audit row με
   `action='payment.approved'`, `changes=null`
2. Verify DB: `approval_status='approved'`, `approved_by` + `approved_at` set

**State machine:**
3. POST `/approve` σε already approved → 409 'ήδη εγκεκριμένη'
4. POST `/approve` σε rejected → 409 'έχει απορριφθεί'

**Auth/edge:** ίδια όπως Phase 2 (9-13)

### Phase 4 — Reject endpoint (Phase B.1b)

**Happy path:**
1. POST `/reject` με reason σε pending → 200 + audit row με
   `action='payment.rejected'`, `notes=reason`
2. Verify DB: `approval_status='rejected'`, `override_reason` populated με
   "ΑΠΟΡΡΙΨΗ: {reason}"

**Server-side merge:**
3. POST `/reject` σε payment με existing override_reason → merged string
   με " | ΑΠΟΡΡΙΨΗ: {new_reason}" appended
4. Second `/reject` με different reason → second append (multiple rejection
   trail preserved)

**Validation:**
5. POST `/reject` χωρίς reason → 400 'reason required'
6. POST `/reject` με empty reason → 400
7. POST `/reject` με reason > 500 chars → 400

**State machine:**
8. POST `/reject` σε approved payment → 200 (transition allowed, audit
   logged)

### Phase 5 — Client migration smoke test

1. `/finances/approvals` page loads
2. Approve button → 200 → list updates → audit visible στο `/audit-log`
3. Reject button με modal + reason → 200 → list updates → audit visible
4. Concurrent edit attempt (2 tabs): both succeed without data corruption
   (server-side merge)
5. Network failure mid-approve: graceful error, no orphan state

### Phase 6 — Production smoke (post-merge)

Στο kriton-aigaleo:
1. Approve μία real pending payment (αν υπάρχει) → verify audit row με
   correct actor identity
2. Reject με reason → verify override_reason merge
3. /audit-log page → verify payment.approved + payment.rejected entries
   εμφανίζονται με labels

---

## 🚧 Out of Scope

### Phase B.1c (deferred)

- Single-row DELETE endpoint για payments (από drill-down UI)
- Cross-linking audit_log ↔ payment_deletion_audit στο UI
- Payment insert audit (γίνεται Phase B.2)

### Phase B.2 (separate PR series)

- POST `/api/finances/payments` (insert endpoint με audit)
- Migrate `app/finances/page.tsx` insert sites (L526, L912-913)
- Migrate `payment_templates` mutations (CRUD endpoints)
- Migrate `app/finances/page.tsx` payment_templates client calls

### Phase C/D (future)

- Sponsors API + audit (PRs C.1, C.2)
- Expenses API + audit (PRs D.1, D.2)
- Reservations attendee updates audit (complex, real-time mutations)

### Permanently out of scope (constitutional)

- Refund flow — `payment_deletion_audit` υπάρχει για bulk delete που
  λειτουργεί ως implicit refund. No separate refund endpoint.
- Version column / optimistic concurrency — N-club traffic δεν
  δικαιολογεί την πολυπλοκότητα.
- Audit log retention policies — όλα τα entries παραμένουν indefinitely.
  Storage cost trivial για το traffic profile.

---

## 📝 Linkage με ROADMAP

### Updates needed όταν Phase B.1a γίνει merged

**Move:**
- Cross-table audit foundation entry → προσθήκη "Phase B.1a ✅ DONE"
  κάτω από Phase A.3

**Add Recently Done entry:**
- PR #XX (feat/payments-audit-patch) recap με commit list

**Add ROADMAP entries που γεννιούνται:**
- Phase B.1b approval RPCs (separate PR, ~3-4 ώρες)
- Phase B.1c single-row delete + cross-linking (deferred)
- Phase B.2 payment inserts + templates (separate PR series)

### Connections με existing ROADMAP entries

- **🔴 RLS overhaul** (production blocker): audit_log RLS πρέπει να μπει
  στο RLS overhaul scope. Πρόσθεσε explicit mention.
- **🟡 Audit για άλλα tables**: αυτό το plan καλύπτει το payments slice.
  Update entry να αναφέρει "payments ✅ via Phase B".
- **🟡 Bell notification για unread audit changes**: αξιολόγηση μετά
  Phase B.1 — αν volume των payment audits είναι significant, bell γίνεται
  more valuable.
