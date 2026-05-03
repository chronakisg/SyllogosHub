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

- [ ] **📊 Event Dashboard (replaces 'Κρατήσεις Εκδηλώσεων' tab)**

  Stack: 📊 Διαχειριστικό

  Strategic context: Το current "Κρατήσεις Εκδηλώσεων" tab είναι
  duplicate view του Πλάνου Τραπεζιών (παρέες-list με payment status).
  Replace με κεντρικό oικονομικό dashboard ανά event.

  Layout:
  - **ΕΣΟΔΑ**
    - Παρέες × ticket_price (ηλικιακά αναλυμένα):
      "6 ενήλικες × 30€ + 2 παιδιά × 2€ + 3 ανώνυμοι × 30€"
    - Χορηγίες (money sum)
    - Σύνολο εσόδων
  - **ΕΞΟΔΑ** (depends on event_expenses schema)
    - DJ: 500€
    - Φωτογράφος: 300€
    - Ενοίκιο: 200€
    - Σύνολο εξόδων
  - **ΑΠΟΤΕΛΕΣΜΑ**
    - Καθαρό κέρδος/ζημία
  - **LIVE STATUS** (την ημέρα)
    - Παρόντες counter
    - Εκκρεμείς πληρωμές
  - **QUICK ACTIONS**
    - "💰 Άνοιγμα Ταμείου" → Cashier Interface

  Phase 1 (έσοδα-only): παρέες × ticket + sponsors
  Phase 2: + event_expenses + net result
  Phase 3: + live status + cashier integration

  Estimated: L (3-phase implementation)
  Replaces: cherry-pick του 29f5078 (abandoned event-financials-tab branch)
  Connects με: event_expenses + age_categorization + Cashier Interface

### Sidebar & UX polish (chore branch)

- [ ] **Events page tabs** — Επερχόμενες / Παλαιότερες / Όλες
  - Default tab: "Επερχόμενες" (event_date >= today)
  - Παλαιότερες: descending sort
  - Counter στα tabs (3) (47)
  - Σήμερα → Επερχόμενες bucket
  - Δεν είναι hide/archive, μόνο διαχωρισμός
  - Estimated: M

### 🎩 Operational interfaces

- [ ] **💰 Cashier Interface (Φάση 2 — Είσοδος/Ταμείο)**

  Stack: 🎩 Operational

  Strategic context: Διακριτός ρόλος από maître. Ο ταμίας/προεδρείο
  στην πόρτα κάνει payment + check-in. Ο maître μέσα στο χώρο κάνει
  guidance + waiter notifications. Δεν είναι ίδιος user, ίδιο interface.

  Νέο menu location: TBD (πιθανότατα tab μέσα στα Events ή
  top-level menu "Ταμείο")

  Flow:
  - Search by attendee name (fuzzy match όλων των reservations του
    selected event)
  - Action card per attendee/παρέα:
    - Όνομα + Παρέα + Τραπέζι (location info)
    - Payment status: ✅ Πληρωμένο / ⚠️ Εκκρεμές
    - Buttons: [Πληρώθηκε τώρα] + [Check-in]
    - Future: [Εκτύπωση εισιτηρίου]
  - Παρέες έρχονται σπαστά (2 τώρα, 2 αργότερα)
  - Per-attendee check-in (όχι bulk)
  - Πληρωμή είναι παρέα-level (ένας πληρώνει για όλη την ομάδα)

  ΟΧΙ νούμερα/ποσά μετά τη φάση πληρωμής — μόνο "πληρωμένο ναι/όχι"
  σαν gating signal.

  Estimated: L (multi-commit, νέο page, search component, action card,
  payment integration)
  Connects με: 3-state presence (διαβάζει presence_status),
  Event Dashboard (entry point button)

### Schema evolution

- [ ] **💵 Event Expenses Schema**

  Stack: 📊 Διαχειριστικό

  Schema:
  ```sql
  create table event_expenses (
    id uuid primary key default gen_random_uuid(),
    club_id uuid not null,
    event_id uuid not null references events(id),
    category text not null check (category in (
      'entertainment',  -- DJ, μουσικοί, ορχήστρα
      'photography',    -- φωτογράφος
      'venue',          -- ενοίκιο χώρου
      'catering',       -- φαγητό
      'decoration',     -- διακόσμηση
      'transportation', -- μεταφορικά
      'other'
    )),
    description text,
    amount numeric not null,
    paid_at timestamptz,
    notes text,
    created_at timestamptz default now()
  );
  ```

  Foundation για Event Dashboard expenses section.

  Estimated: S-M (schema + simple CRUD UI)
  Connects με: Event Dashboard (Phase 2)

### 📱 Mobile & Cross-cutting

- [ ] **📱 Mobile UX Polish — orientation + header optimization**

  Stack: 📊 + 🎩 (επηρεάζει και τα δύο)

  Field testing έδειξε 2 issues σε tablet + κινητό PWA installation:

  **Issue 1: Orientation locked to portrait**
  - manifest.json έχει `'orientation': 'portrait'` (ή parsed κάπως)
  - Tablet ειδικά χρειάζεται landscape για:
    - Πλάνο Τραπεζιών (wide layout)
    - Events listing (πολλές στήλες)
  - Plan:
    - Change manifest → `'orientation': 'any'`
    - Audit όλα τα pages σε landscape
    - Adjust max-width containers

  **Issue 2: Header taking ~340px on mobile**
  - Logo + club name + tab nav + user card = wasted space
  - Plan για mobile (<768px):
    - Collapse logo σε icon
    - Hamburger menu για nav
    - User card → dropdown από avatar
    - Target: ~50-60px total header

  Estimated: M (responsive design + manifest update + multi-page audit)
  Priority: High (UX blocker σε field use)

## 🟢 Nice to Have / Future

### Seating UX

- [ ] **🔴 "Full" visual state για 100% γεμάτα τραπέζια**

  Stack: 📊 Διαχειριστικό + 🎩 Operational

  Strategic context: Όταν planning είναι complete (παρέα 8 ατόμων
  σε τραπέζι 8 θέσεων), το τραπέζι είναι "πλήρες" σε σχεδιασμό —
  default state μέχρι να ενεργοποιηθεί το Lock Attendance flow στις
  23:00. Visual cue χρειάζεται για quick scan του πλάνου.

  Spec:
  - Trigger: `attendees.length >= capacity` (idle state)
  - Color: μπορντό solid (brand color, signals "filled completion")
  - Status text: "Πλήρες" αντί generic "Κατειλημμένο"
  - Όταν Lock Attendance κάνει release (no-show), επιστρέφει σε
    "Has space" state αυτόματα

  UX considerations:
  - Διαφορετικό από κίτρινο over-capacity warning (drag mode)
  - Διαφορετικό από dimmed (occupied σε assignment mode)
  - Συμπληρωματικό με upcoming 3-state presence model

  Estimated: S
  Connects με: 3-state presence model (lock attendance flow)

- [ ] **🏛️ Max venue capacity ανά event**

  Stack: 📊 Διαχειριστικό

  Strategic context: Κάθε εκδήλωση έχει μέγιστο αριθμό καλεσμένων
  βάσει του χώρου (εστιατόριο, αίθουσα, κλπ). Σήμερα δεν τηρείται
  πουθενά, οπότε σύλλογος μπορεί να υπερβεί το όριο σε σχεδιασμό
  χωρίς προειδοποίηση.

  Schema:
  - `events.venue_max_capacity` (smallint, nullable)
  - Π.χ. 200 για κανονικό χορό, 350 για mega event

  UI:
  - Visible στο event header + settings tab
  - Counter pattern: "31 άτομα / 200 max" στο /seating header
  - Warning visual όταν φτάνεις 90% του max

  Validation:
  - Hard block; Soft warning; → TBD
  - Πιθανώς: hard block σε νέες reservations, soft warning για
    υπέρβαση μέσω AttendeesEditor (override capability)

  Connects με: planning workflow, sponsorship sizing, event dashboard

  Estimated: M-L (schema + UI + validation logic)

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

- [ ] **📜 Σύνοψη inline expand στο /events listing**

  Stack: 📊 Διαχειριστικό

  Strategic context: Σήμερα το "Σύνοψη →" button οδηγεί σε ξεχωριστή
  σελίδα. Καλό για print, αλλά για quick check-up αξίζει inline view.

  UI:
  - Expandable row στο /events listing
  - Click ▾ → εμφανίζεται summary inline κάτω από τη γραμμή
  - Click ▴ → collapse
  - Reuse existing summary component (data fetch + display)
  - "Πλήρης Σύνοψη" link μέσα στο expanded view → printable page

  Estimated: S-M (expandable row UI, reuse existing summary)

### 🎩 Operational interfaces (future)

- [ ] **🎩 Maître / Floor Manager Interface**

  Stack: 🎩 Operational (sub-role)

  Strategic context: Διακριτός user role: maître ≠ προεδρείο.
  Ο maître στο χώρο της εκδήλωσης χρειάζεται εντελώς διαφορετική info
  από τον ταμία στην είσοδο.

  Page: `/seating/floor` (ή `/seating/maitre`)

  View: Tables grid με:
  - Fill ratio: 5/8 (πραγματικά παρόντες)
  - Status indicator: αναμένει / σερβίρισμα / γεμάτο
  - Counts breakdown: 6👨 + 2👶 (ηλικιακή κατανομή)

  ΟΧΙ:
  - Ονόματα παρεών
  - Νούμερα €
  - Payment info
  - Check-in actions

  Actions:
  - "Ειδοποίηση σερβιτόρων" όταν τραπέζι γεμίζει (push notification
    ή visual signal)
  - Read-only για όλα τα άλλα

  Estimated: M (νέο page + simplified UI + age breakdown)
  Connects με: 3-state presence, age_categorization, push notifications

- [ ] **🎫 Print Tickets (στο Cashier flow)**

  Stack: 🎩 Operational (sub-feature του Cashier)

  Use case: Στο ταμείο, μετά πληρωμή + check-in, εκτύπωση
  εισιτηρίου με την πληροφορία τραπεζιού.

  Ticket content:
  - Όνομα attendee
  - Όνομα εκδήλωσης + ημερομηνία
  - Τραπέζι (πού να καθίσει)
  - Co-attendees της παρέας (προαιρετικό)
  - Branding συλλόγου
  - QR code για future re-scan

  Print options:
  - Browser print (thermal-receipt-friendly layout)
  - PDF download (mobile preview)

  Estimated: S (στο Cashier flow ως sub-feature)
  Depends on: Cashier Interface

### Schema evolution (future)

- [ ] **🏗️ Event Partners Schema (replaces entertainment string)**

  Stack: 📊 Διαχειριστικό

  Strategic context: Σήμερα τα entertainment partners είναι free-form
  text. Πρέπει structured data ώστε να συνδέονται με event_expenses
  (DJ name + DJ fee).

  Schema:
  - Migrate από flat 'entertainment' field → structured table
  - `event_partners (id, event_id, role, name, contact, fee, notes)`
  - Roles: DJ, ορχήστρα, φωτογράφος, βιντεολήπτης, decorator, etc.

  Sync με event_expenses: ένας partner = ένα expense entry
  (auto-link by event + role).

  UI:
  - Replace simple text field στο edit modal με structured form
  - "+ Συνεργάτης" → name + role dropdown + fee
  - Display στο event dashboard: lista με ρόλους

  Migration challenge: existing entertainment data → manual review
  + categorization.

  Estimated: M (schema + migration script + UI overhaul)
  Connects με: event_expenses, Event Dashboard

### Seating UX follow-ups (post PR #12 + #13)

- [ ] **Multi-party seating support** (1:N reservations per table)
  - Σήμερα: 1 παρέα ανά τραπέζι (current data model + UI silently
    keep-last-wins σε `reservationByTableNumber` Map)
  - Goal: 1:N — multiple parties σε ένα τραπέζι (π.χ. 2 ζευγάρια από
    4 μοιράζονται 8-θέσιο)
  - Required: refactor `reservationByTableNumber` →
    `Map<number, Reservation[]>`
  - TableCard "Κατειλημμένο · X άτομα" → sum across all parties
  - TablePopover → list όλων των παρέων σε ένα τραπέζι
  - Larger feature — needs planning session
  - Estimated: L

- [ ] **Drag-and-drop από Section 2 σε άλλο τραπέζι**
  - Σήμερα: assigned παρέες δεν drag-able από sidebar Section 2
    (Παρέες σε Τραπέζια)
  - Goal: drag from Section 2 σε άλλο τραπέζι (re-assign) ή στο
    Section 1 (unassign)
  - Estimated: S-M

- [ ] **Click παρέα Section 2 → scroll/highlight floor plan**
  - Σήμερα: click → opens AttendeesEditor
  - Bonus: visual feedback "πού είναι αυτή η παρέα στο floor plan"
  - Animated scroll + temporary highlight του τραπεζιού
  - Estimated: S

- [ ] **TablePopover window resize re-measurement**
  - Σήμερα: smart positioning measured once στο `showPopover`
    transition
  - Goal: re-measure σε resize event (rare edge case)
  - Estimated: XS

- [ ] **TablePopover horizontal edge handling**
  - Σήμερα: `-translate-x-1/2` πάντα centers το popover
  - Edge case: bottom-corner tables → popover μπορεί να clip
    horizontally
  - Goal: detect viewport edges + flip horizontally αν χρειαστεί
  - Estimated: S

- [ ] **TablePopover focus management (a11y)**
  - Σήμερα: read-only display, no interactive elements (Esc handler
    υπάρχει)
  - Future: αν προστεθούν actions στο popover (π.χ. "scroll to in
    floor plan"), focus trap + return focus on close
  - Estimated: S (όταν χρειαστεί)

### Tech Debt & Cleanup

- [ ] **TableLabelEdit `editInitialValue` prop** (post PR #13)
  - Goal: αν θέλουμε ποτέ να pre-fill το edit input με current label
    (custom ή party name)
  - Σήμερα edit pre-fill είναι κενό αν δεν υπάρχει custom label
  - Estimated: XS

- [ ] **📊 Re-launch abandoned `feat/event-financials-tab` branch**
  - Branch deleted 2026-05-03, commit hash `29f5078` preserved για future cherry-pick
  - Original work: payment toggle στον AttendeesEditor (single commit)
  - **Superseded by:** Event Dashboard entry (πιο comprehensive 3-phase plan)
  - Cherry-pick μπορεί ακόμα να χρησιμοποιηθεί ως starting point για το payment toggle aspect
  - `git cherry-pick 29f5078` σε νέο branch όταν έρθει η ώρα
  - Estimated: S (cherry-pick + rebase resolution)

- [ ] **🧹 Consolidate event editing surfaces**
  - 3 διαφορετικά implementations:
    - `app/seating/page.tsx` AddEventModal (create-only, minimal)
    - `app/events/page.tsx` EventModal (full create + edit, multi-tab)
    - `app/calendar/page.tsx` EventEditor (separate)
  - Risk: drift μεταξύ τους όταν προστίθενται νέα fields
    (παράδειγμα: venue_max_capacity μπήκε σε 2/3 αρχικά)
  - Solution: shared `<EventForm>` component που χρησιμοποιείται
    από όλα τα surfaces
  - Estimated: M

- [ ] **xlsx → exceljs migration** (security concerns με xlsx package)
- [ ] **Drop `reservations.guests` jsonb column** (post PR #15 merge)
  - Code-side cleanup έγινε στο PR #15 (GuestsPanel deprecated)
  - Pending: `ALTER TABLE reservations DROP COLUMN guests;`
  - Run μετά το merge στη Supabase SQL Editor
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

### chore/cleanup-and-quick-edit (merged 2026-05-03) — PR #15

7 commits, comprehensive cleanup + seating UX revamp:

- [x] `.gitignore` — `.claude/scheduled_tasks.lock` (cd293c0)
- [x] **Display name helpers consolidation** — 3 file-locals →
  shared `formatMemberName` (aa7023a)
- [x] **Greek collation sensitivity** — `{ sensitivity: "base" }`
  σε 12 localeCompare calls (7 files) (7f0b93f)
- [x] **GuestsPanel deprecation** — αφαίρεση legacy feature
  (~291 lines), preparation για column drop (b28d0d6)
- [x] **Quick-edit modal για μετονομασία παρέας** — pencil icon
  inline στο ReservationChip, single-field rename (8e83cc0)
- [x] **Capacity-aware drag feedback** — yellow border όταν
  drag-over over-capacity table + ConfirmOverCapacityModal με
  amber accent (4856119)
- [x] **Reserved tables = hard block** — ConfirmAssignReservedModal
  removed (~91 lines), 🔒/🔓 toggle είναι το override mechanism
  (dd3fbe5)
- [x] **Color legend strip** πάνω από tables grid — 3 entries
  (Διαθέσιμο/Δεν χωράει/Πιασμένο) (dd3fbe5)
- [x] **Header counters update** — `πληρωμένες/εκκρεμείς` →
  `παρόντες/αναμένονται` — seating focus on presence/identity,
  not payments (dd3fbe5)
- [x] **4-state assignmentMode chain cleanup** — collapse
  occupiedByOther + isReserved branches (dd3fbe5)

Bonus fixes εντοπισμένα κατά τη διάρκεια:
- presence semantic separation στο ReservationChip
- onDragLeave child-element flicker fix (relatedTarget pattern)

### feat/seating-unified-list (merged 2026-05-03) — PR #13

8 commits, /seating sidebar restructure + table popover:

- [x] Sidebar split σε 2 sections — Παρέες χωρίς Τραπέζι +
  Παρέες σε Τραπέζια (4883b35)
- [x] Rounded "Νο N" badge στο ReservationChip (6c25e09)
- [x] Reposition badge κάτω από avatar για compact card height
  (8f56e46)
- [x] TableCard middle text cleanup — generic "Κατειλημμένο"
  αντί group_name (cf6ead9)
- [x] TablePopover (desktop hover, occupied tables only) (04831f9)
- [x] Touch fallback + click-outside-to-close (691f676)
- [x] Smart positioning above/below + Esc to close (dc9806a)
- [x] TableCard cleanup — free seats chip + remove catering line
  (d9721fe)

### feat/age-categorization (merged 2026-05-02) — PR #12

12 commits, full age-categorization feature + bonus fixes:

- [x] Schema migration: `clubs.child_age_threshold` +
  `reservation_attendees.is_child_override` (425cfc3)
- [x] `resolveIsChild` helper utility (7c045f1)
- [x] AttendeesEditor child toggle (👶/🧑/⚪) + counter (5c99881)
- [x] AddReservationModal με Ενήλικες + Παιδιά inputs (4b7c138)
- [x] TableCard catering breakdown (c29752e)
- [x] ReservationChip sidebar breakdown (901f7db)
- [x] /settings/club child age threshold input (021be2b)
- [x] fix: hydration race condition στο /settings/club —
  useCurrentClub double-call coordination (538f637)
- [x] AttendeesEditor bulk-add παιδιών checkbox (357ba3d)
- [x] Cultural fit — ΕΠΩΝΥΜΟ Όνομα display fix σε 7 sites
  (3c63bf8)
- [x] Split inputs Ενήλικες/Παιδιά στο anonymous-add mode
  (d7cc04d)
- [x] fix: presence semantic split στο ReservationChip — pre-existing
  bug όπου presentCount περιελάμβανε expected (fc7119e)

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
