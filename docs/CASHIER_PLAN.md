# Cashier Interface — Implementation Plan

> Created: 2026-05-06  
> Status: Phase 1 — schema + UI implementation  
> Stack: 🎩 Operational

## Στόχος

Νέο page `/events/[id]/cashier` που επιτρέπει στο προεδρείο/ταμία
στην είσοδο εκδήλωσης να κάνει **πληρωμή + check-in σε ένα tap**
ανά attendee ή ανά παρέα.

## Real-world use cases

1. **Pre-paid γραμμή 10 προσκλήσεων:** Ο Άκης πληρώνει 300€ για 10
   προσκλήσεις πριν την εκδήλωση. Άλλοι έρχονται σπαστά (2 τώρα,
   3 αργότερα, 5 μετά). Ο ταμίας δεν χρειάζεται να ξανα-ασχοληθεί
   με πληρωμές — μόνο check-in.
2. **Pay-at-door:** Παρέα 6 ατόμων χωρίς πληρωμή. Έρχονται 2 →
   60€ τώρα + check-in 2. Έρχονται οι υπόλοιποι 4 → 120€ + check-in 4.
3. **No-show resolution:** Όσοι δεν ήρθαν → no-show after lock,
   δεν πληρώνουν ποτέ. Θέσεις απελευθερώνονται.

## Locked decisions

### Section 1 — Schema

- Per-attendee payment tracking (όχι reservation-level)
- Migration `0013_reservation_attendees_payment_fields.sql`:
  - `paid_at timestamptz NULL`
  - `paid_amount numeric(10,2) NULL`
  - `paid_by_user_id uuid NULL REFERENCES auth.users(id)`
  - CHECK: `(paid_at IS NULL) OR (paid_amount IS NOT NULL)`
  - Partial index: `WHERE paid_at IS NULL` για cashier hot path
  - `paid_at` is client-supplied (έρχεται `now()` από app, όχι trigger)
  - `paid_by_user_id` nullable (για backdated/imported data)
  - Snapshot πριν τη migration (RUN πρώτα):
    `reservation_attendees_backup_20260506`

### Section 2 — Route & Permissions

- Route: `/events/[id]/cashier` (per-event context)
- Entry point: button «💰 Άνοιγμα Ταμείου» στο event modal/dashboard
- Permission gate: `cashier` permission (υπάρχει ήδη στο role system)
- AccessDenied page για users χωρίς permission
- Mobile-first design (tap targets ≥ 44px, sticky header/footer)
- Inside AppShell (όχι full-screen)

### Section 3a — Layout

- **Sticky header** με ← back, event title, KPIs (πληρωμένοι/παρόντες)
- **Sticky search bar**
- **Reservation cards** sorted by status (εκκρεμή → μερικώς → πλήρωμένα),
  alphabetical secondary
- **Status chip** σε 3 states: ⚠️ εκκρεμή / 🟡 μερικώς / ✅ πλήρες
- KPI counters: `paid attendees / total` + `present / total`

### Section 3b — Open party flow

- Click "Άνοιξε παρέα" → expanded view
- **Named attendees:** lista με checkbox per row, sorted Lead → παρόντες
  → αναμένονται. Ήδη πληρωμένοι: disabled checkbox.
- **Anonymous buckets:** group by age category (ενήλικες / παιδιά)
  με ± counter. Δείχνει «X διαθέσιμοι» (unpaid count).
- **Sticky footer:** «Επιλεγμένοι: X · Σύνολο: Y€» +
  «💰 Πληρωμή & Check-in (X)» button
- **Atomic update** σε ένα SQL UPDATE: `paid_at + paid_amount +
  paid_by_user_id + presence_status='present' + checked_in_at`
- Παρών χωρίς πληρωμή = παράλληλο state (επιτρέπεται)
- Infinite scroll (no pagination/virtualization για phase 1)

### Section 3c — Edge cases

| Scenario | Handling |
|---|---|
| Concurrent edits (2 ταμίες) | Optimistic + toast «πληρώθηκαν X από Y» |
| Network failure | Spinner + retry toast |
| Empty attendees | Empty state + return button (data integrity issue) |
| Walk-ins (no reservation) | Out of scope phase 1 (ROADMAP) |
| Double-tap | Disabled button + spinner standard |
| No selection | Button disabled όταν επιλεγμένοι = 0 |
| Παρών χωρίς πληρωμή | ⚠️ flag στη reservation card |

### Section 4 — Sync με /seating

- **Sidebar reservation chip:** μικρό 💰 icon με 3 states + tooltip
- **Permission-gated:** μόνο users με `cashier` ή `finances` το βλέπουν
- **TableCard / TablePopover:** ΟΧΙ payment indicator (keep spatial)
- **Sync mode:** manual refresh (no realtime/polling για phase 1)
- **Atomic update** εξασφαλίζει consistent state όταν το /seating refetch

### Section 5 — PR Breakdown

| PR | Branch | Scope | Estimate |
|---|---|---|---|
| **PR1** | `feat/cashier-schema` | Migration + types + plan doc | S (~45 min) |
| **PR2** | `feat/cashier-page` | Cashier page + UI flow + mutation | L (~3-5 ώρες) |
| **PR3** | `feat/seating-payment-indicator` | Sidebar chip με payment status | S (~1 ώρα) |

**Sequential merge:** PR1 → migration apply σε production → PR2 → PR3.

## Phase 2 ROADMAP entries (deferred)

- «Επιλογή όλων unpaid» quick shortcut button
- Walk-ins quick-add (νέα παρέα από cashier)
- Real-time sync με Supabase realtime subscriptions
- Refund/undo flow (αν προκύψει need)
- Sidebar quick access για ταμία («Ταμείο» link στο menu)

## Critical principles

- **Per-attendee data, party-level UX:** ένα tap παίρνει payment+checkin
  για όλους τους επιλεγμένους
- **Refund = never:** καμία undo λειτουργία στο schema/UI
- **Standalone-able principle:** /seating δουλεύει χωρίς cashier data
- **Permission segmentation:** payment visibility μόνο για ταμία/finances
- **One-shot atomic mutation:** payment + check-in σε ένα SQL UPDATE
