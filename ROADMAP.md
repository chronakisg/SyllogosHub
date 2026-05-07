# SyllogosHub — Roadmap

> Last updated: 2026-05-06 (Cashier Phase 1 — schema + UI + entry point στο finance dashboard)  
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

### Super Admin & Multi-tenancy

- [ ] **Modular features ανά σύλλογο** (feature flags)
  - Core για όλους: Μέλη + Εκδηλώσεις + Ημερολόγιο
  - Opt-in modules: Seating, Cashier, Οικονομικά, Επικοινωνία
  - Schema: club_modules table (club_id, module, enabled)
  - Admin panel: toggle modules ανά σύλλογο
  - Sidebar: εμφάνιση μόνο enabled modules
  - Billing: modules συνδεδεμένα με plan
  - Estimated: L (multi-session, schema + UI + sidebar refactor)

- [ ] **Κατηγορίες συλλόγων**
  - Παραδοσιακοί, αθλητικοί, επαγγελματικοί, φιλικοί κλπ
  - Schema: clubs.category column
  - Admin panel + onboarding form
  - Estimated: S

- [ ] **Admin panel — Club edit functionality**
  - /admin/clubs/[id]: αλλαγή plan, toggle is_active
  - PATCH /api/admin/clubs/[id]
  - Estimated: S-M

- [ ] **Ημερολόγιο ως default module για όλους**
  - Σήμερα: optional στο sidebar
  - Στόχος: πάντα ορατό, visual αποτέλεσμα για όλους
  - Estimated: XS (sidebar config change)

### Reservations & Attendees domain

- [ ] **Booker concept** — `reservations.booker_member_id`
  - Use case: Γιώργος κάνει κράτηση για 10 φίλους, δεν είναι ο ίδιος attendee
  - UI: Dropdown στο "Νέα Παρέα" modal (default: τρέχων user)
  - Sidebar display: «Κράτηση από: ΧΡΟΝΑΚΗΣ ΓΙΩΡΓΟΣ»
  - Estimated: M-L

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

- [ ] **📊 Event Dashboard — Phase 3 (live status enhancements)**

  Stack: 📊 + 🎩 Operational hybrid

  Done in 2026-05-06 (Cashier PR2):
  - [x] Quick action button "💰 Ταμείο →" δίπλα στο event picker
  - [x] Cashier flow integration (dedicated /cashier/[eventId]
    route με back link σε /finances?tab=dashboard)

  Phase 3 remaining scope:
  - Live παρόντες counter στο dashboard (refresh αυτόματα όταν
    γίνεται mutation σε άλλο tab — Supabase realtime)
  - Εκκρεμείς πληρωμές με quick toggle στο reservation drill-down
    (δεν εμφανίζεται στο cashier — εδώ είναι για admin overview)

  Connects με: 3-state presence + Cashier Phase 2 realtime sync

  Estimated: M (μειώθηκε από L μετά την Phase 1 ολοκλήρωση)

### 🎩 Operational interfaces

- [ ] **💰 Cashier Interface — Phase 2 enhancements**

  Stack: 🎩 Operational

  Phase 1 ολοκληρώθηκε στο PR1+PR2 (2026-05-06): see Recently Done.
  Phase 2 deferred items, εντοπισμένα κατά την υλοποίηση:

  Selection & flow shortcuts:
  - "Επιλογή όλων unpaid" quick shortcut button μέσα στο modal
    για παρέες με pre-paid 10 προσκλήσεις (1-tap select all)
  - Walk-ins quick-add: button «+ Νέα παρέα» μέσα στο cashier
    flow για άτομα χωρίς reservation
  - Sidebar top-level link «💰 Ταμείο» με event picker
    (alternative entry για multi-event scenarios)
  - Smart back navigation: document.referrer fallback αντί
    hard-coded /finances?tab=dashboard

  Concurrency & robustness:
  - Concurrent edit handling: optimistic UI με toast
    «πληρώθηκαν X από Y — οι υπόλοιποι ήδη πληρώθηκαν»
    (Section 3c.1 του CASHIER_PLAN.md)
  - Real-time sync με Supabase realtime subscriptions ώστε
    multi-cashier scenarios να βλέπουν live updates

  Print & receipts:
  - Εκτύπωση εισιτηρίου ανά attendee/παρέα (thermal-receipt
    layout + PDF download για mobile preview)
  - Branding συλλόγου + QR code για future re-scan

  Refund flow:
  - Currently: refund = never (constitutionally)
  - Future iteration: αν προκύψει need από users, undo flow
    με audit log + reason field

  Estimated: M-L (κάθε feature ~S-M ξεχωριστά)
  Connects με: ολοκληρωμένο Cashier Phase 1, 3-state presence,
  realtime infrastructure, print/PDF generation

### Schema evolution

### 📱 Mobile & Cross-cutting

- [ ] **📱 Mobile Header Collapse — compact header <768px**

  Stack: 📊 + 🎩

  Done: Orientation fix (PR #9 — manifest 'any')

  What's left:
  - Logo collapse σε icon (mobile only)
  - Hamburger menu για nav
  - User card → dropdown από avatar
  - Target: ~50-60px total header (από ~340px σήμερα)

  Estimated: M (responsive design, AppShell rework)
  Priority: High (UX blocker σε field use)

## 🟢 Nice to Have / Future

### Super Admin & Multi-tenancy

- [ ] **Standalone syllogoshub.gr + ξεχωριστό Super Admin app**
  - Σήμερα: /admin ζει μέσα στον Hub (hub.party4u.gr)
  - Στόχος: admin.syllogoshub.gr ως ξεχωριστό Next.js app
  - Γίνεται μετά την ολοκλήρωση του syllogoshub.gr
  - Estimated: L

- [ ] **Free trial 3 μηνών για νέους συλλόγους**
  - clubs.trial_ends_at column
  - Auto-disable μετά τη λήξη
  - Warning banner στον σύλλογο πριν τη λήξη
  - Estimated: M

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

- [ ] **🎵 Master `/settings/club/entertainers` page**

  Stack: 📊 Διαχειριστικό

  Strategic context: Master κατάλογος ψυχαγωγών υπάρχει σε schema
  (`entertainers` table) και χρησιμοποιείται μέσω inline create
  στο event modal. Λείπει visibility — δεν υπάρχει standalone
  management page.

  Mirror του pattern που εφαρμόστηκε σε:
  - PR sponsors-to-settings (Χορηγοί master κατάλογος)
  - /settings/club/ticket-categories
  - /settings/club/expense-categories

  UI:
  - List entertainers με τύπο + contact info + event count
  - Create / edit / delete (delete-protect αν συνδέεται με events)
  - Card στο /settings dashboard με icon 🎵
  - Permission gate: settings

  Estimated: S-M (mirror του sponsors-to-settings)
  Connects με: εφαρμογή του "Entertainers ↔ Event Expenses sync"

- [ ] **🪧 Empty state hints σε dropdowns**

  Stack: 📊 Cross-cutting UX

  Strategic context: Όταν master catalog είναι κενός, ο user
  βλέπει empty dropdown και υποθέτει bug. Real example: 
  /events Συνεργάτες tab — dropdown φαινόταν "σπασμένο" επειδή
  δεν είχαν δημιουργηθεί entertainers ακόμα.

  Pattern για όλα τα catalog-driven dropdowns:
  - Όταν options.length === 0, εμφάνιση μηνύματος:
    "Δεν υπάρχουν [τύπος] στον κατάλογο. Πατήστε «+ Νέο/α [τύπος]»
    για να ξεκινήσετε."
  - Αφορά: entertainers, sponsors (αν εμφανίζονται empty),
    ticket-categories, expense-categories, departments
  - Inline action button οπτικά prominent

  Estimated: S (helper component + 5-6 sites)

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

- [ ] **🎵 Entertainers ↔ Event Expenses sync**

  Stack: 📊 + 💰 (cross-cutting)

  Strategic context: Schema είναι ήδη structured (`entertainers` +
  `entertainment_types` + `event_entertainers` με fee column από
  PR #12 era). Λείπει η σύνδεση με `event_expenses` και η σωστή
  permission segmentation.

  Σημερινό drift:
  - `event_entertainers.fee` δείχνει αμοιβές στο event modal
    Συνεργάτες tab — ορατό σε όποιον έχει `events` permission
  - `event_expenses` είναι ξεχωριστό domain στο /finances Έξοδα
  - Ο γραμματέας γράφει την ίδια αμοιβή 2 φορές με κατηγοριοποίηση
    χωρίς ονόματα (DJ — 600€ vs DJ Νίκος — 600€)
  - Architectural principle violation: τιμές πρέπει να είναι
    permission-gated (`finances` only), όχι παντού

  Στόχος (Option C — strip & relink):
  - Drop column `event_entertainers.fee` (αφαίρεση από Συνεργάτες tab)
  - Συνεργάτες tab γίνεται info-only (entertainer + notes)
  - Νέο column `event_expenses.entertainer_id` (uuid FK nullable)
  - /finances Έξοδα tab: όταν category = entertainment, dropdown
    entertainer + auto-populate description
  - Migration script: μεταφορά existing fees σε expense rows
  - Permission gating: αμοιβές μόνο σε `finances` role visibility

  UX μετά:
  - Πρόεδρος/γραμματέας στο event modal: βλέπει "DJ Νίκος" χωρίς τιμή
  - Ταμίας στα Οικονομικά: βλέπει "DJ Νίκος — 600€" ως expense
  - Single source of truth: ένα data entry, όχι δύο

  Estimated: M-L (schema migration + UI refactor + data migration)
  Connects με: event_expenses, /finances Έξοδα tab, Event Dashboard,
  permission system

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

- [ ] **Audit /discounts location** (architectural inconsistency)
  - Currently lives at `app/discounts/`, εκτός `app/settings/` tree
  - Should be co-located με τα άλλα settings sub-pages
  - Proposed location: `app/settings/club/discount-rules/page.tsx`
  - Requires URL migration + redirect from old route
  - Estimated: S

- [ ] **Expanded expense fields UI** (vendor_name + payment_method + notes)
  - Schema έχει ήδη columns, save logic τα στέλνει null
  - UI δεν εμφανίζει — μόνο category/description/amount/paid
  - Future: collapsible row ή expand-to-edit pattern
  - Estimated: S

- [ ] **Extract TicketCategoryModal σε shared component**
  - Σήμερα υπάρχουν 2 modal implementations:
    * Full CategoryModal στο
      `app/settings/club/ticket-categories/page.tsx`
      (name, short_label, kind, default_price, notes)
    * Minimal CreateCategoryModal στο
      `app/events/page.tsx`
      (name, kind, default_price)
  - DRY refactor: ένα `components/TicketCategoryModal.tsx`
    με optional fields configuration
  - Estimated: S

- [ ] **TableLabelEdit `editInitialValue` prop** (post PR #13)
  - Goal: αν θέλουμε ποτέ να pre-fill το edit input με current label
    (custom ή party name)
  - Σήμερα edit pre-fill είναι κενό αν δεν υπάρχει custom label
  - Estimated: XS

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
  - `reservation_attendees_backup_20260506` (Cashier PR1 safety net)
  - Παραμένουν ως safety net για το beta — drop όταν συγχωνευθεί feature
    + production stable για ~1 εβδομάδα
- [ ] **Drop `user_roles` table (dead code)**
  - Defined σε `lib/supabase/types.ts` αλλά δεν χρησιμοποιείται
  - `useRole` διαβάζει αλλά δεν επηρεάζει permission computation
  - Replaced από proper role-based system (PR pending)
  - Drop μετά το merge: `drop table public.user_roles;`
  - Καθάρισμα: `getCurrentUserRole()` σε `lib/supabase/server.ts`
    + state field στο `useRole`
  - Estimated: XS (single SQL + 2 small code edits)

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

### feat/super-admin-panel (merged 2026-05-07) — PR #31 + #32

- [x] Migration 0014: super_admins table + clubs.plan/is_active columns
- [x] lib/admin/seedClub.ts — seed defaults για νέο σύλλογο
      (6 roles + permissions, 2 ticket categories,
       8 expense categories, club_settings)
- [x] lib/auth/requireSuperAdmin.ts — server-side guard
- [x] POST /api/admin/clubs — create club + seed + auth user +
      member + role assignment end-to-end
- [x] proxy.ts: redirect /admin/* → /login αν no session
- [x] app/admin/layout.tsx — super-admin guard + isolated layout
- [x] app/admin/clubs/page.tsx — λίστα συλλόγων με plan/status badges
- [x] app/admin/clubs/new/page.tsx — form δημιουργίας νέου συλλόγου
- [x] app/admin/clubs/[id]/page.tsx — club detail με stats + billing
- [x] app/AppShell.tsx — skip render για /admin/* (hooks-safe)
- [x] fix: logout redirect → /login?redirect=/admin/clubs (PR #32)

### feat/cashier-schema + feat/cashier-page (2026-05-06) — PR1 + PR2

Two-PR stacked feature για Cashier Interface Phase 1.
Comprehensive planning session με 26 locked decisions
στο docs/CASHIER_PLAN.md, 8 internal commits στο PR2,
real mutation tested in production.

**PR1: feat/cashier-schema (1 commit)**
- [x] Migration 0013: per-attendee payment fields
  - paid_at timestamptz NULL
  - paid_amount numeric(10,2) NULL
  - paid_by_user_id uuid NULL → auth.users(id) ON DELETE SET NULL
  - CHECK constraint: paid_amount required if paid_at
  - Partial index idx_attendees_unpaid (WHERE paid_at IS NULL)
  - Snapshot table reservation_attendees_backup_20260506 πριν τη migration
- [x] types.ts: ReservationAttendee Row + Insert types
  (Update auto-derived μέσω Partial<Omit>)
- [x] docs/CASHIER_PLAN.md: 117 lines comprehensive plan doc
- [x] RESERVATION_SELECT στο shared lib/utils/attendees.ts
  ενημερώθηκε με τα 3 νέα payment columns (μετά από bug fix:
  undefined !== null εμφάνιζε όλους ως πληρωμένους)

**PR2: feat/cashier-page (7 commits)**
- [x] Skeleton route + permission gate (cashier permission)
  στο top-level /cashier/[eventId]
- [x] Reservation cards list με 3 status states
  (⚠️ pending / 🟡 partial / ✅ complete) + age breakdown
  + KPIs (X/Y πληρωμένοι · Z/Y παρόντες)
- [x] Open-party modal με named attendees lista,
  3 close mechanisms (backdrop, ×, Esc), bottom-sheet
  σε mobile / centered σε desktop
- [x] Anonymous buckets (Ενήλικες/Παιδιά) με ± counter
  selection logic
- [x] Sticky footer με selection totals + 3-line modal header
  (composition / status / X€ από Y€)
- [x] Atomic payment + check-in mutation:
  - Group selected attendees by price → 1 UPDATE per
    unique amount (Promise.all parallel)
  - Single UPDATE sets paid_at + paid_amount + paid_by_user_id
    + presence_status='present' + checked_in_at
  - isPaying state για double-tap protection
  - reloadKey για refetch trigger
  - Error handling με existing error banner
- [x] Entry button «💰 Ταμείο →» στο event dashboard
  (/finances?tab=dashboard) δίπλα στο event picker
  - Permission-gated visibility
  - Conditional on selectedEventId truthy
- [x] Back link στο cashier /finances?tab=dashboard
  (αντί / που ήταν safe default)

**Architectural decisions:**
- Per-attendee data, party-level UX
- Refund = never (constitutionally)
- Standalone-able principle preserved (cashier route ξεχωριστό
  από /seating, mobile-first, focused tool)
- Permission segmentation: payment editing μόνο για όσους
  έχουν cashier permission. Group-based via roles
  (Ταμίας/Πρόεδρος/Διαχειριστής)
- Architectural correction mid-flow: entry point μετακινήθηκε
  από /events (δημόσιο) → /finances (financial-permission-gated)
- One-shot atomic mutation: payment + check-in σε ένα SQL UPDATE

**Production verification:**
- Real payment flow tested με 1 attendee (ΧΡΟΝΑΚΗΣ ΓΙΩΡΓΟΣ)
- All 5 fields updated atomically στη DB
- UI refresh-άρει σωστά μετά mutation
- Partial status emerged correctly (1/9 paid)

**Phase 2 deferred items**: see Cashier Interface entry στα
High Priority sections.

### feat/event-dashboard-phase1 (merged 2026-05-05) — PR #22

Major PR με 31 commits — Event Dashboard ολόκληρο
με Έσοδα/Έξοδα/Χορηγοί sub-tabs + sponsor financial
architecture.

**Phase 1 — Έσοδα Dashboard:**
- [x] lib/utils/eventRevenue.ts — pure functions για
  revenue calculations με category_kind matching
- [x] EventDashboardTab.tsx component split (628 lines)
- [x] Layout: ΣΥΜΜΕΤΟΧΗ → ΟΙΚΟΝΟΜΙΚΑ (3 cards) →
  ΛΕΠΤΟΜΕΡΕΙΕΣ → ΧΟΡΗΓΟΙ
- [x] ΣΥΝΟΛΟ card real-time view (Τώρα / Εκκρεμή έσοδα /
  Εκκρεμή έξοδα / Τελικό)
- [x] /finances tab routing με query param

**Phase 2 — Έξοδα Catalog + /finances integration:**
- [x] Migration 0009: event_expenses table
- [x] Migration 0010: expense_categories table
  (per-club catalog, 8 default seeds)
- [x] Migration 0011: event_expenses category_id FK refactor
- [x] /settings/club/expense-categories CRUD page (699 lines)
- [x] ExpensesPanel.tsx με replace-all DELETE+INSERT save
- [x] Dashboard sub-tabs Έσοδα / Έξοδα

**Phase 3 — Sponsor Financial Architecture:**
- [x] Migration 0012: event_sponsors.received_at column
  (promised vs received distinction)
- [x] types.ts: EventSponsor.received_at field
- [x] Event modal Χορηγοί tab → info-only
  (drop financial editing fields)
- [x] SponsorsPanel.tsx — financial editing component
  στο /finances με 3o sub-tab
- [x] AddSponsorshipDialog: link existing sponsors
  από master registry, filter already-linked
- [x] Filter members ήδη χορηγοί από Νέος Χορηγός
  modal (bug fix)
- [x] Drop SponsorPicker από event modal (~314 lines)
  για strict info-only alignment

**Architectural decisions:**
- Events page = info-focused (δημόσιο info window)
- /finances = financial editing (permission-gated)
- Sponsors entity creation στο master Χορηγοί tab
  (persists across events)
- Per-event sponsorship linking στο SponsorsPanel
- Sponsors money δεν μπαίνει στα Έσοδα μέχρι
  received_at != null
- Pending sponsors NOT στα Εκκρεμή Έσοδα
  (uncertain receivable, διαφορετικό από pending
  reservations)

**Polish (μέρος του ίδιου PR):**
- [x] Settings header unification σε 7 sub-pages
  (clickable title με ← arrow)
- [x] ExpensesPanel layout fix (table-fixed +
  column widths + w-full inputs)
- [x] SponsorsPanel UI symmetry με ExpensesPanel
  (trash button column, disabled-input για
  non-money rows)

### feat/ticket-categories (merged 2026-05-04) — PR #?

Per-club catalog για κατηγορίες προσκλήσεων. Source of truth για labels,
αντικαθιστά το freeform input στο event modal. Foundation για consistent
multi-tenant labels και kind-based matching σε downstream features.

**Schema (3 migrations):**
- [x] Migration 0006: ticket_categories table
      (id, club_id, name, short_label, default_price,
      display_order, is_archived, category_kind enum,
      notes) + 2 default seeds ανά club
      (Ενήλικας/adult, Παιδί/child)
- [x] Migration 0007: event_ticket_prices.category_id
      nullable FK + index
- [x] Migration 0008: category_id NOT NULL + drop label
      column

**Code:**
- [x] types.ts: TicketCategory + TicketCategoryKind
      ('adult'|'child'|'other') + constants
- [x] /settings/club/ticket-categories CRUD page με
      optimistic updates + reorderingId safeguard
      κατά rapid clicks
- [x] /settings dashboard: card "Κατηγορίες Προσκλήσεων"
- [x] Event modal "Τιμές" tab: replace freeform label
      input με dropdown από catalog
- [x] Auto-fill price από category.default_price σε
      κάθε category change (overwrite για consistency)
- [x] Inline shortcut "+ Νέα κατηγορία στον κατάλογο"
      → minimal modal με 3 fields (name, kind,
      default_price)
- [x] Filter των already-selected categories per event
- [x] Empty catalog state με link στο settings
- [x] EventSummaryPanel display via category join
      (replaces removed label column)
- [x] Friendly error για 23505 unique constraint
      violation στα names
- [x] Permission gate: settings (consistent με
      departments pattern)

### feat/role-based-permissions (merged 2026-05-04) — PR #?

Major foundation + complete UI για role-based permission system
σε ένα PR. Η μεγαλύτερη single-PR δουλειά της session.

**Schema (migration 0005, idempotent):**
- [x] 3 new tables: member_roles, member_role_permissions,
  member_role_assignments (FKs, unique constraints, RLS off)
- [x] cashier module added στο permission CHECK constraint
  + types.ts + ALL_PERMISSIONS + MODULE_TO_PERMISSION
- [x] 6 default roles seeded ανά club:
  Πρόεδρος ΔΣ (32 perms), Αντιπρόεδρος (17), Ταμίας (9),
  Γραμματέας (9), Μέλος ΔΣ (4), Απλό Μέλος (2)
- [x] Auto-assignment: members με board_position →
  corresponding role; rest → "Απλό Μέλος"
- [x] Snapshot: members_predates_roles_20260504

**useRole hook refactor:**
- [x] legacyBoardPositionPermissions removed (-28 lines)
- [x] computePermissions: priority 1 admin/president → ALL,
  priority 2 union(rolePermissions, customPermissions),
  priority 3 default ['calendar']
- [x] 4 queries instead of 3 (added joined role+permissions)
- [x] State includes assignedRoles + rolePermissions

**Server foundation:**
- [x] lib/supabase/admin.ts — service role client (cached)
- [x] lib/auth/requireAdmin.ts — server guard με AdminContext
- [x] SUPABASE_SERVICE_ROLE_KEY documented στο .env.local.example

**API routes — Users (12 endpoints total):**
- [x] /api/admin/users/[id]/login — POST/GET/PATCH/DELETE
- [x] /api/admin/users/[id]/login/enable — POST
- [x] /api/admin/users/[id]/roles — POST
- [x] /api/admin/users/[id]/roles/[roleId] — DELETE

**API routes — Roles CRUD:**
- [x] /api/admin/roles — GET (list + counts), POST (create)
- [x] /api/admin/roles/[id] — PATCH (rename), DELETE
- [x] /api/admin/roles/[id]/permissions — GET, PATCH (replace)

**UI — Unified single page:**
- [x] /settings/users — "Χρήστες & Δικαιώματα" με 2 tabs:
  * Tab "Άτομα": login mgmt + role chips per member
  * Tab "Ομάδες": role list + matrix per role + create custom
- [x] PermissionMatrix.tsx — reusable component (8 modules × 4)
- [x] /settings dashboard: card "Χρήστες & Δικαιώματα"
  (αφαιρέθηκε το παλιό card "Δικαιώματα")
- [x] /permissions route → redirect σε /settings/users
  (graceful for old bookmarks)
- [x] AppShell sidebar activePaths updated

**Bug fixes:**
- [x] /calendar infinite loading για anonymous/missing-clubId
  users (3 unguarded early returns σε useCallback functions)

**Live verification (πολλαπλά smoke tests):**
- [x] Auth gate: anonymous → 401
- [x] Role assign/remove via API + UI
- [x] Login create: real auth user, verified στο Supabase Dashboard
- [x] Custom role create/delete via UI
- [x] Permission edit per role + save
- [x] Tab switching (Άτομα ↔ Ομάδες)
- [x] /permissions redirect verified
- [x] Calendar loading recovered after fix
- [x] tsc clean throughout

**Critical for production deployment:**
- [ ] **Add SUPABASE_SERVICE_ROLE_KEY στο Vercel env vars
  ΠΡΙΝ το merge** — αλλιώς admin API routes σπάνε σε production

### feat/venue-max-capacity (merged 2026-05-03) — PR #16

- [x] `events.venue_max_capacity` smallint nullable column
- [x] EventInsert / EventUpdate types στο hand-crafted types.ts
- [x] Input field στο /events EventModal (DetailsTab)
- [x] /seating header counter με color thresholds
      (text-red-600 σε overflow)
- [x] AddEventModal στο seating page συμπεριλαμβάνει το field

### feat/presence-cleanup (merged 2026-05-02) — PR #11

- [x] Αφαίρεση του "Καθάρισε ανώνυμους απόντες" feature
      (~175 lines από entrance-list)
- [x] Anti-pattern για παραδοσιακούς συλλόγους —
      αντικαθίσταται από manual lock (μελλοντικά)

### feat/presence-3state-ui (merged 2026-05-02) — PR #10

Μεγάλο PR, 9 files, multi-feature:

- [x] AttendeesEditor 3-state presence UI
      (expected/present/no_show counters + badges)
- [x] /events page tabs (Επερχόμενες/Παλαιότερες/Όλες) με
      tabCounts
- [x] AddReservationModal rewrite
- [x] Seating sidebar cleanup
- [x] "Δεν ήρθε" badge → "Αναμένεται" rename

### fix/pwa-orientation (merged 2026-05-02) — PR #9

- [x] manifest.ts orientation 'portrait' → 'any'
- [x] Tablet landscape support για /seating wide layouts

### feat/presence-3state-quickfix (merged 2026-05-02) — PR #7

- [x] Schema: is_present boolean → presence_status enum
      (expected | present | no_show)
- [x] Backfill existing data → "expected"
- [x] Type updates σε 5 files (hand-crafted types.ts)

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

---

## 📜 Older Releases

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

### feat/guest-list-attendees (merged 2026-05-01) — PR #2

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
