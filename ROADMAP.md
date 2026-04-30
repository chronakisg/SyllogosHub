# SyllogosHub — Roadmap

> Last updated: 2026-04-30  
> Maintained alongside the codebase. Update this file as part of the same PR
> when adding/completing tasks.

## 🟢 In Progress

- [ ] **`feat/guest-list-attendees`** — PR pending merge to main

## 🔴 Critical / Production Blockers

- [ ] **RLS policies** for production multi-tenancy
  - All current policies are `authenticated_all` → no per-club isolation
  - Required before opening to other clubs beyond beta client
- [ ] **iOS Safari PWA test** — verify install + auto-update flow

## 🟡 High Priority (post-beta)

### Reservations & Attendees domain

- [ ] **Booker concept** — `reservations.booker_member_id`
  - Use case: Γιώργος κάνει κράτηση για 10 φίλους, δεν είναι ο ίδιος attendee
  - UI: Dropdown στο "Νέα Παρέα" modal (default: τρέχων user)
  - Sidebar display: «Κράτηση από: ΧΡΟΝΑΚΗΣ ΓΙΩΡΓΟΣ»
  - Estimated: M-L

- [ ] **Παρών / Απών** (check-in flow) — `reservation_attendees.is_present`
  - Use case: στην είσοδο της εκδήλωσης, τσεκάρω ποιοι ήρθαν
  - UI: Checkbox σε κάθε attendee row + entrance list view
  - Default: `true` (όλοι παρόντες αρχικά)
  - Sort tweak: present πάνω, απόντες κάτω (μέσα στο ίδιο bucket)
  - Estimated: M

- [ ] **STEP 4 — Entrance List με ονόματα + capacity warnings**
  - `app/seating/entrance-list/page.tsx` να εμφανίζει attendee names
  - Capacity warnings (αν παρέα > τραπέζι)
  - "Καθάρισε ανώνυμα" quick action
  - Connects με `is_present` για live attendance

### Members domain

- [ ] **Member delete flow** — `/members` modal δεν έχει delete button
  - Considerations: cascade σε attendees, payment history retention
  - Soft vs hard delete decision
  - Estimated: M

## 🟢 Nice to Have / Future

### Family & Genealogy

- [ ] **Genealogy module** (Επίπεδο 3 — Genealogical tree)
  - Schema: `genealogy_nodes` με `father_node_id` + `mother_node_id`
  - Internal members + external ancestors (πεθαμένοι, μη-μέλη)
  - Auto-computed σχέσεις (αδέρφια, ξαδέρφια, παππούδες)
  - Tribute features για βραβεύσεις πεθαμένων μελών
  - Tree visualization (`react-d3-tree` ή `family-chart`)
  - Estimated: L (multi-session feature)

- [ ] **Family seating proximity hint**
  - Όταν διαφορετικές παρέες ανήκουν στην ίδια οικογένεια, hint στο seating
  - Π.χ.: ΧΡΟΝΑΚΗΣ ΓΙΩΡΓΟΣ (5 άτομα) και ΧΡΟΝΑΚΗΣ ΚΩΣΤΑΣ (6 άτομα) είναι αδέρφια
  - UI: badge 👪 στο sidebar, ή suggestion στο table picker
  - Detection: ίδιο `family_id` → easy / genealogy → χρειάζεται genealogy module
  - Estimated: M

### UX & Polish

- [ ] **Mobile responsive fixes** — user card too tall σε mobile viewport
- [ ] **Real PWA logo** (αντικατάσταση placeholder #800000)
- [ ] **Manifest screenshots** για app stores / install prompts
- [ ] **Extract shared Modal component** — `<Modal>`, `<ConfirmDialog>`
  - Σήμερα `ModalShell` είναι local function στον AttendeesEditor
  - `ConfirmDeleteReservationModal` είναι standalone
  - Refactor σε `components/Modal.tsx` + `components/ConfirmDialog.tsx`

### Tech Debt & Cleanup

- [ ] **xlsx → exceljs migration** (security concerns με xlsx package)
- [ ] **Drop unused `reservations.guests` jsonb column**
  - Confirmed empty in beta DB, never used in app code
- [ ] **Document hand-crafted types.ts decision**
  - `npx supabase gen types` workflow είναι BROKEN για αυτό το project
  - types.ts είναι hand-crafted — γράψε comment + README section
- [ ] **Drop snapshot tables** (post merge):
  - `reservations_backup_20260430`
  - `members_backup_20260430`
  - Παραμένουν ως safety net για το beta — drop όταν συγχωνευθεί feature

## ✅ Recently Done

### feat/guest-list-attendees (this branch)

- [x] Schema: `reservation_attendees` table + backfill (commit `a0b64b1`)
- [x] Read-only display στο seating page (commit `4e5b5a0`)
- [x] AttendeesEditor UI με 3 add modes + family suggestion (commit `8016d43`)
- [x] Bug fix: seed anonymous attendees on reservation create (commit `371eacb`)
- [x] Delete reservation flow με custom themed dialog (commit `d6b947a`)
- [x] Sort fix: lead → members → guests → anonymous (commit `ebb9805`)
- [x] Lead toggle (un-set) fix (commit `2226b55`)

### Pre-existing (μέχρι 2026-04-30)

- [x] Family system με `family_id` + `family_role`
- [x] Member modal με tabs (Στοιχεία / Οικογένεια / Τμήματα / Ρόλος)
- [x] PWA setup με auto-updates και home screen installation
- [x] Events refactor + Finances V2

---

## 📝 Maintenance Rules

1. **Update on PR**: Όταν κλείνει feature/fix, μετακίνηση από In Progress → Recently Done
2. **Add new items inline**: Όταν εμφανίζεται νέο requirement, πρόσθεσέ το αμέσως — μην το αφήνεις να χαθεί
3. **Estimated size key**:
   - **S** — λίγες ώρες, ένα commit
   - **M** — μισή μέρα, multi-commit branch
   - **L** — multi-session feature, νέα schema
4. **Recently Done** κρατάει μόνο τα τελευταία ~10 items. Παλιά μετακινούνται σε CHANGELOG (αν φτιαχτεί).
