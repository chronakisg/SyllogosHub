# SyllogosHub — Roadmap

> Last updated: 2026-05-03  
> Maintained alongside the codebase. Update this file as part of the same PR
> when adding/completing tasks.

## 🧭 Vision & Architecture Compass

> Το end-game του seating domain είναι **ηλεκτρονικές προσκλήσεις με QR check-in**.
> Κάθε attendee παίρνει unique link/QR. Στην είσοδο της εκδήλωσης, η hostess
> σκανάρει και το σύστημα δείχνει τραπέζι + co-attendees, με auto check-in.

### Guiding principles

- **Static token, dynamic resolution.** Το QR/link περιέχει μόνο `attendee_id`.
  Τα στοιχεία (τραπέζι, παρέα, co-attendees) διαβάζονται live τη στιγμή του scan
  ή του open. Έτσι ακυρώσεις/μεταφορές/αλλαγές παρέας δεν invalidate-άρουν τις
  ήδη απεσταλμένες προσκλήσεις.
- **Παραδοσιακοί σύλλογοι = συνεχείς αλλαγές.** Ακυρώσεις και μετακινήσεις
  γίνονται μέχρι την τελευταία στιγμή. Καμία απόφαση schema/UX δεν πρέπει να
  υποθέτει "frozen state" μετά την αρχική κράτηση.
- **Παρέα ≠ νοικοκυριό ≠ γενεαλογία.** Τρία διαφορετικά concepts που συνεργάζονται:
  παρέα = ad-hoc group ανά εκδήλωση, νοικοκυριό = `family_id`, γενεαλογία = tree.

### Build order (foundation → end-game)

1. ✅ **Attendees layer** — `reservation_attendees` με member/guest/anonymous
2. 🔜 **Presence layer** — `is_present` + manual check-in από entrance list
3. 🔜 **Identity layer** — invitation token + public invitation page
4. 🔜 **Scan layer** — QR scanner page + auto check-in
5. 🔜 **Delivery layer** — send via email → SMS → Viber/WhatsApp
6. 🔜 **Visibility layer** — live attendance dashboard για admin

Κάθε layer έχει standalone value και μπορεί να σταματήσει οπουδήποτε.

## 🏗️ Architectural Stacks

> Το SyllogosHub χωρίζεται σε **δύο διακριτά mental models** που εξυπηρετούν
> διαφορετικές χρονικές στιγμές και διαφορετικούς χρήστες. Το ίδιο data layer
> (events, reservations, attendees) τροφοδοτεί και τα δύο, αλλά κάθε stack
> έχει δικό του UX footprint.

### 📊 Διαχειριστικό Stack — admin / planning (πριν την εκδήλωση)

Χρήστης: γραμματεία συλλόγου, ταμίας, υπεύθυνος εκδήλωσης.
Χρονική στιγμή: από booking μέχρι post-event reporting.

- `/events` + `/events/summary/[eventId]` — event lifecycle
- `/seating` — table plan, παρέες, lead members (το **planning** view)
- `/members` — member CRUD, family relations
- `/finances` (+ `/finances/approvals`, `/finances/discounts`, receipt views)
- `/sponsors` (consolidated tab μέσα στα Οικονομικά)
- `/calendar`, `/permissions`, `/settings/*`
- Components: `AttendeesEditor`, `TableCard`, sidebar reservation card

### 🎩 Operational Stack — event-time (την ώρα της εκδήλωσης)

Χρήστης: hostess, maître d', υπεύθυνος εισόδου.
Χρονική στιγμή: live, στην πόρτα της εκδήλωσης.

- `/seating/entrance-list` — mobile-first check-in από list με capacity warnings
- 🔜 `/seating/checkin` — QR scanner page με auto check-in
- 🔜 `/seating/live` — real-time attendance dashboard
- 🔜 `/invite/[token]` — public invitation page (attendee-facing)
- Mental model: read-mostly, optimistic UI, mobile-first, low-friction toggles
- ΟΧΙ νούμερα/ποσά/εκπτώσεις — η hostess χρειάζεται status signal
  (πληρωμένο: ναι/όχι), όχι οικονομικό detail.

### Standalone-able principle

Κάθε stack πρέπει να μπορεί να λειτουργήσει **χωρίς εξαρτήσεις από features που
δεν αφορούν το use case** του πελάτη.

- **Seating χωρίς Finances**: ένας οργανωτής γάμου, ιδιωτικού πάρτυ, ή εστιάτορας
  θέλει table planning + παρέες + check-in, αλλά **όχι** πληρωμές/χορηγίες.
  Το Finances είναι opt-in module, όχι hard dependency.
- **Operational χωρίς Διαχειριστικό polish**: η hostess στην πόρτα δεν χρειάζεται
  AttendeesEditor — μόνο toggle + counter.
- **Διαχειριστικό χωρίς Operational**: μικροί σύλλογοι μπορεί να μην κάνουν ποτέ
  QR check-in — το planning stack στέκει standalone.

> **Implication για design decisions:** schema/UX επιλογές δεν πρέπει να
> coupling-άρουν τα δύο stacks. Π.χ. το `is_present` toggle δουλεύει χωρίς
> invitation token, το ticket_price δουλεύει χωρίς ever να χρησιμοποιηθεί
> entrance list.

## 🟢 In Progress

_(no active branches)_

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

- [ ] **🎩 Presence UX Revisions — 3-state model**

  Stack: Πρωτίστως 🎩 Operational (manual lock είναι event-time action),
  αλλά touches και 📊 Διαχειριστικό (AttendeesEditor counters).

  Strategic context: Παραδοσιακοί σύλλογοι ≠ formal events. Άνθρωποι
  έρχονται σταδιακά (στις 21:00 μπορεί 3 από 11, στις 23:00 και τα 11).
  Το current 2-state model (παρών/απών) είναι λάθος για αυτό το context.

  Schema migration: `is_present` boolean → `presence_status` enum
  - `expected` (default — αναμένεται να έρθει)
  - `present` (έχει check-in)
  - `no_show` (manual mark μετά grace period)

  Backfill: existing data → "expected" (όχι "present" όπως το current
  default), αφού το current optimistic default ήταν semantically λάθος.

  UI changes:
  - "Δεν ήρθε" badge → "Αναμένεται" (soft gray, όχι red)
  - Sidebar counter (📊): "11 άτομα · 8 παρόντες · 3 αναμένονται"
  - Entrance list (🎩): 3 buckets αντί για 2

  New: Manual "Κλείδωμα παρουσιών" action (🎩 operational)
  - Button στο /seating/entrance-list page (πρωτεύον location)
  - Confirmation dialog: "Όσοι αναμένονται θα μαρκαριστούν ως no-show"
  - Reserved tables που είναι άδεια: confirmation dialog για unlock
  - Reverse-able: ΟΧΙ auto-undo, αλλά manual revert per attendee
    (no_show → expected χειροκίνητα)

  Remove: existing "Καθάρισε ανώνυμους απόντες" feature
  - Anti-pattern: σταδιακή άφιξη είναι κανονική σε παραδοσιακό context
  - Replaced by: 3-state model + manual lock

  Estimated: M (multi-commit, schema migration, UI overhaul σε 2 stacks)
  Connects με: Vision Layer 2 (Presence Layer ολοκληρώνεται με αυτό)

### Members domain

- [ ] **Member delete flow** — `/members` modal δεν έχει delete button
  - Considerations: cascade σε attendees, payment history retention
  - Soft vs hard delete decision
  - Estimated: M

### Invitations & Check-in domain (future layers)

- [ ] **Invitation token** — `reservation_attendees.invitation_token` (uuid, unique)
  - Generated on attendee creation
  - Foundation για identity layer
  - Estimated: S

- [ ] **Public invitation page** — `app/invite/[token]/page.tsx`
  - Live data: τραπέζι, παρέα, co-attendees, ώρα εκδήλωσης
  - Branded με club theme
  - QR code εμφανώς ως screen-show option ("Δείξε στην είσοδο")
  - Estimated: M

- [ ] **QR scanner page** — `app/seating/checkin/page.tsx`
  - Camera access + QR decode (jsQR ή html5-qrcode)
  - Auto-set `is_present = true` on scan
  - Welcome screen: "Καλώς ήρθατε [Όνομα]! Τραπέζι [Νο], με [co-attendees]"
  - Estimated: M-L

- [ ] **Send invitations** — email πρώτα
  - Edge function ή API route που στέλνει σε όλους τους attendees με email
  - Template με club branding + QR + στοιχεία
  - Track sent/delivered/opened (αργότερα)
  - Estimated: M

- [ ] **SMS/Viber/WhatsApp delivery** — second wave
  - Provider TBD (Viber Business, Twilio, ή Greek SMS gateway)
  - Estimated: L

- [ ] **Live attendance dashboard** — `app/seating/live/page.tsx`
  - Real-time count: "127 / 320 ήρθαν"
  - Παρέες απόντες με κόκκινο highlight
  - Estimated: M

### Finances domain

- [ ] **📊 Event Financials tab** — οικονομική επισκόπηση ανά εκδήλωση
  - Replace το current "Κρατήσεις Εκδηλώσεων" tab (duplicate view με
    Πλάνο Τραπεζιών — όλη η ίδια info υπάρχει εκεί)
  - Νέο content: per-event income breakdown
    - Πληρωμένες παρέες × event.ticket_price
    - Αναμενόμενα έσοδα (εκκρεμείς παρέες)
    - Χορηγίες (sum από sponsors_event για το event)
    - Σύνολο εσόδων
  - Phase 1: έσοδα-only (existing data, no schema changes)
  - Phase 2 (future): event_expenses table + net profit/loss
    - Νέα schema entries για ψυχαγωγία/catering/ενοίκιο
    - Calculation κέρδος/ζημία
  - Tab name: "Οικονομικά Εκδηλώσεων"
  - Estimated: M (1-2 commits για Phase 1)
  - Connects με: existing /finances state-based tabs pattern

### Sidebar & UX polish (chore branch)

- [ ] **Events page tabs** — Επερχόμενες / Παλαιότερες / Όλες
  - Default tab: "Επερχόμενες" (event_date >= today)
  - Παλαιότερες: descending sort
  - Counter στα tabs (3) (47)
  - Σήμερα → Επερχόμενες bucket
  - Δεν είναι hide/archive, μόνο διαχωρισμός
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

- [ ] **📊 Re-launch abandoned `feat/event-financials-tab` branch**
  - Branch deleted 2026-05-03, commit hash `29f5078` preserved για future cherry-pick
  - Original work: payment toggle στον AttendeesEditor (single commit)
  - Re-launch when Presence 3-state migration ολοκληρωθεί (avoid schema conflicts)
  - `git cherry-pick 29f5078` σε νέο branch όταν έρθει η ώρα
  - Estimated: S (cherry-pick + rebase resolution)

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
- [ ] **Migration safety conventions** (process, όχι code)
  - Snapshot pattern με `create table as select` αντιγράφει ΜΟΝΟ data, όχι FKs/constraints
  - Για schema rollback: χρησιμοποίησε authentic migration files, όχι rename backup
  - Pre-flight diagnostic queries πριν από κάθε destructive SQL operation
  - Κλείνουμε rollback/scratch tabs στο SQL Editor μόλις ολοκληρωθεί migration
  - Ποτέ destructive SQL χωρίς full block review πριν paste
  - Rollback SQL ΔΕΝ μπαίνει σε chat ως "comment to keep handy" (risky paste)
  - Document αυτές τις conventions σε `docs/MIGRATIONS.md` (όταν γίνει)
  - Estimated: S (write doc + add to README)

## ✅ Recently Done

### feat/reserved-tables (merged 2026-05-01) — PR #5

13 commits, comprehensive seating UX iteration:

- [x] Reserved tables με VIP labels (cfbc289)
- [x] Universal label override pattern — custom labels universally
  εμφανίζονται, sticky across changes (ab93469)
- [x] TableCard polish: 4-corner button symmetry, shape toggle
  inversion, unassign as corner icon (058a416-37a40b0, 0ffc070)
- [x] Smart visual feedback during assignment — 4-state
  (πράσινο/κίτρινο/reserved/disabled) με capacity awareness (4416d84)
- [x] Sidebar reservation card με ⭐ Lead member display +
  conditional παρόντες counter (4987a3f)
- [x] AttendeesEditor title cleanup (αφαίρεση "Άτομα:" prefix)
- [x] Compact page headers global — 50% λιγότερο vertical space
  σε όλες τις main pages (3f2a64b, 6569ed7)
- [x] Sponsors → tab στα Οικονομικά consolidation (c108802)
- [x] Sidebar section labels removal + thin divider

### feat/presence-checkin (merged 2026-05-01) — PR #3

- [x] Schema: reservation_attendees.is_present + checked_in_at
  (commit 0ca10fe)
- [x] AttendeesEditor: tap-to-toggle is_present με optimistic UI
  + "Δεν ήρθε" badge + "X · Y παρόντες" counter (eadfa29)
- [x] Entrance list (app/seating/entrance-list/page.tsx):
  full mobile-first rewrite με capacity warnings +
  "Καθάρισε ανώνυμους απόντες" cleanup action
- [x] Sidebar button "📋 Λίστα Εισόδου & Check-in"
- [x] Connection με is_present για live attendance tracking

### chore/roadmap-vision-pr2 (merged 2026-05-01) — PR #4

- [x] Vision & Architecture Compass section — end-game narrative
  (QR check-in με electronic invitations) + 3 guiding principles +
  6-layer build order
- [x] Invitations & Check-in domain — 6 future-layer items
  (token, public page, QR scanner, send via email/SMS/Viber,
  live dashboard)

### Hotfix: reservation_attendees schema rebuild (2026-05-01)

- Accidental rollback (drop + rename backup) έσπασε όλα τα FKs του `reservation_attendees`
- Snapshot table από `create table as select` δεν είχε αντιγράψει constraints/FKs/indexes
- App έσπασε με "Could not find a relationship between 'reservations' and 'reservation_attendees'"
- Hotfix: fresh start από authentic 0002 + 0003 schemas + backfill anonymous attendees
- Data preserved: 1 reservation, 11 anonymous attendees, no real customer data lost
- 11 attendees, 3 FKs, 6 indexes, 1 RLS policy, 1 trigger restored

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
