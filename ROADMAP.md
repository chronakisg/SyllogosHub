# SyllogosHub — Roadmap

> Last updated: 2026-05-13 (Portal post-login return-to deferred — documented for future trigger)  
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

### Sidebar topology

Το app sidebar χωρίζεται σε **3 mental zones** που εξυπηρετούν
διαφορετικά user mindsets:

1. **Daily Operations** — members/events/finances/cashier/seating/calendar/subscribers
   - Daily admin work, transaction-oriented
   - Frequent access, primary working surface
2. **Monitoring & Admin** (μεταξύ divider lines) — audit-log
   - Investigative mindset: "ψάχνω τι συνέβη / ποιος έκανε τι"
   - Future audit features (πληρωμές tracking, permission changes,
     bulk action logs, system events) μπαίνουν στην ίδια ζώνη
3. **Configuration** — settings (+ sub-pages)
   - Setup work, less-frequent access
   - One-time or rare changes (roles, permissions, club info)

**Implication για design decisions:** Όταν προστεθούν νέα
audit/monitoring features, δεν χρειάζονται νέα ζώνη του sidebar
— απλά νέες entries στην ίδια. Audit είναι **standalone domain**,
όχι sub-feature κάποιου specific module.

**Public pages εκτός sidebar:** Routes χωρίς auth context
(`/[clubSlug]/welcome`, `/[clubSlug]/unsubscribe` — βλ. 🌐 Public
Engagement Stack) **δεν** εμφανίζονται στο sidebar. Sidebar
απαιτεί logged-in member με permissions.

## 🏗️ Architectural Stacks

> Το SyllogosHub χωρίζεται σε **πολλαπλά διακριτά mental models** που
> εξυπηρετούν διαφορετικές χρονικές στιγμές και διαφορετικούς χρήστες. Το ίδιο
> data layer (events, reservations, attendees, members) τροφοδοτεί όλα τα
> stacks, αλλά κάθε stack έχει δικό του **user persona**, **temporal context**,
> και **UX footprint**. Κάθε stack είναι **standalone-able** — μπορεί να
> ενεργοποιείται ή να μένει ανενεργό χωρίς να επηρεάζει τα υπόλοιπα.

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

### 🟣 Member Portal Stack — member self-service

Χρήστης: logged-in μέλος του συλλόγου (magic link auth).
Χρονική στιγμή: όποτε — async self-service, ανεξάρτητο από event lifecycle.

- `/portal/login` — magic link request form
- `/portal/auth-callback` — server-side verifyOtp + linkage
- `/portal/profile` — read-only identity + self-update whitelist
- 🔜 `/portal/events` — visibility σε events + reservations history
- 🔜 `/portal/finances/me` — οφειλές + πληρωμές history (μόνο δικά του)
- 🔜 `/portal/departments/[id]` — class enrollment + announcements per τμήμα
- Mental model: read-mostly self-service, mobile-first, family-aware
  (parent βλέπει παιδιά τους εγγεγραμμένα σε τμήματα/εκδηλώσεις)
- ΟΧΙ admin-level data (other members' amounts, board info, audit log)
- Foundation merged: Chunk 2 — Auth + Profile (PR #44, 2026-05-09).
  Pending Chunks tracked στο 🟡 High Priority → 🟣 Member Portal domain.

### 🌐 Public Engagement Stack — anonymous lead capture

Χρήστης: ανώνυμοι επισκέπτες (φίλοι μελών, παρευρισκόμενοι σε
εκδηλώσεις, web visitors).
Χρονική στιγμή: όποτε — δεν εξαρτάται από event lifecycle.

- `/[clubSlug]/welcome` (public, no auth) — branded welcome form
- `/[clubSlug]/unsubscribe` (public, no auth) — GDPR right
- `/subscribers` (admin) — lead management + conversion flow

Mental model: **conversion funnel**. Δεν είναι member, δεν είναι
attendee, είναι **lead**. Φιλικό UI, GDPR-compliant, mobile-first
(QR scans από smartphones).

Module-gating: σύλλογος μπορεί να ενεργοποιήσει/απενεργοποιήσει το
module `subscribers` στο `club_modules` table. Φοιτητικοί σύλλογοι
με κλειστή λίστα δε χρειάζονται lead capture. Business συλλόγοι με
recruitment focus τo θεωρούν essential.

QR distribution sources (3 από Phase 1):

1. **Per-club generic QR** — αφίσα/banner στον χώρο του συλλόγου
2. **Per-event QR** — εκτυπώνεται για συγκεκριμένη εκδήλωση
3. **Per-member QR** — referral system, κάθε μέλος μοιράζεται το δικό του

Όλα οδηγούν στην ίδια welcome page με διαφορετικό `?ref=` parameter
για source tracking.

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

- [ ] **🔴 Identity model bugs (multi-tenant launch blocker)**

  Discovered: 2026-05-12 morning, attempting test club creation
  via super admin panel.

  **Bug cluster:**

  1. **✅ RESOLVED (2026-05-13) — Super admin /admin/clubs redirect
     στο /login παρά τα σωστά data στο super_admins table.**
     - Πρωτογενής υποψία (PWA SW intercepts requests) επιβεβαιώθηκε:
       stale `pages-rsc` / `apis` caches από Serwist `defaultCache`
       σερβίριζαν παλιές responses για /admin/* paths.
     - Παράλληλη αιτία: missing `SUPABASE_SERVICE_ROLE_KEY` στο
       Vercel production env → `getAdminClient()` failed στο
       `requireSuperAdmin()` lookup, layout threw → redirect.
     - Fix: PR #68 (app/sw.ts — NetworkOnly για authenticated paths,
       skipWaiting:true, one-time activate cache cleanup) + Vercel
       env var addition + redeploy.
     - Production-verified: /admin/clubs φορτώνει για super admin,
       club list σωστή (ΣΥΛΛΟΓΟΣ ΚΡΗΤΩΝ ΑΙΓΑΛΕΩ visible).
     - See Recently Done: fix/sw-exclude-authenticated-paths.

  2. **✅ RESOLVED (2026-05-13) — `members.user_id NULL` για existing
     accounts** (verified με SQL diagnostic)
     - **Initial assumption:** 244 kriton members χρειάζονται backfill
       για να δουλέψει το Member portal.
     - **Πραγματικότητα:** 234/244 (96%) δεν έχουν καν email — **δεν
       είναι portal candidates**. Από τα 10 με email, 9 **δεν** έχουν
       matching auth.users entry (κανείς δεν έχει ενεργοποιήσει portal
       account ακόμα).
     - linkAuthUserToMember() από PR #44 είναι **self-healing**: όταν
       ένας από τους 10 κάνει magic link login, αυτόματα δημιουργείται
       auth.users entry + αυτόματα linkάρεται με το member row.
     - **No backfill SQL needed.** Original ROADMAP entry βασιζόταν σε
       λάθος υπόθεση ότι όλοι οι members έχουν portal accounts.
     - Παράλληλο discovery: 3 kriton members μοιράζονται 1 email
       (οικογένεια Κουρουγκιαούρη) → βλ. νέο edge case entry
       στο 🟡 High Priority → 🟣 Member Portal domain.

  3. **Duplicate auth.users με ίδιο email πιθανό**
     - Κατά το debugging είδαμε διαφορετικά UUIDs να επιστρέφονται
       για info@party4u.gr σε διαφορετικά queries
     - Πιθανή αιτία: seedClub.ts creates auth user χωρίς email
       uniqueness check
     - Production risk: νέος σύλλογος με email που υπάρχει →
       undefined behavior, possible orphan users
     - Fix: seedClub.ts pre-check email existence
     - Estimated: S (add check) + M (DB cleanup script αν χρειαστεί)

  4. **Defense-in-depth κενό στο proxy.ts για super admin**
     - Σήμερα: proxy.ts κάνει auth check μόνο (έχει user ή όχι)
     - Δεν κάνει super admin check για /admin/* paths
     - Λειτουργεί σήμερα επειδή layout.tsx κάνει redirect,
       αλλά νέα admin route handlers χωρίς guard θα είναι εκτεθειμένα
     - Estimated: S (add super admin check στο middleware)

  5. **Silent redirect στο admin layout χωρίς logging**
     - Όλα τα errors (401/403/500) → redirect("/") χωρίς log
     - Δύσκολο να διαγνώσεις production issues (όπως μόλις είδαμε)
     - Fix: structured logging + maybe distinct redirect URLs ανά
       error type
     - Estimated: S

  **Suggested investigation order (separate session):**
  1. ✅ Service worker theory verification — DONE (PR #68, 2026-05-13)
  2. ✅ Backfill members.user_id για 244+ existing members —
     DONE/N/A (SQL diagnostic 2026-05-13, βλ. Bug #2 reassessment)
  3. seedClub.ts hardening (email uniqueness pre-check)
  4. Logging + defense-in-depth refactor (proxy.ts super admin check)

  **Required before multi-tenant onboarding.** Δεν προχωρούμε σε
  νέους συλλόγους πριν λυθούν τα παραπάνω.

- [ ] **RLS overhaul για όλα τα tables**
  - Pre-existing 'RLS production blocker' ξεκαθαρίστηκε στο PR #44
    review: 20 admin sites εξαρτώνται από browser/session queries
    στο members table χωρίς service role wrapper.
  - Aggressive RLS → admin app θα σπάσει.
  - Στόχος: comprehensive policies για όλα τα tables (members,
    clubs, events, finances, departments, ...) με admin allow-all
    + member self-access patterns.
  - Smoke test όλα τα admin sites μετά την εφαρμογή.
  - Required before opening to other clubs beyond beta client
  - Estimated: L (multi-session)
- [ ] **iOS Safari PWA test** — verify install + auto-update flow
- [ ] **🔴 lib/supabase/types.ts drift με production schema**

  Discovered: 2026-05-12 (Phase B.1a smoke testing)

  Payments table verified drift:
  - 'created_at' column listed στο types.ts but ΔΕΝ υπάρχει στη DB
  - club_id nullability inverse (DB: NOT NULL, TS: nullable)
  - member_id, payment_date, type, approval_status nullability
    mismatches (DB: nullable, TS: non-null)

  Implication: TS compile-time guarantees are MISLEADING για το
  payments domain. Runtime behavior depends on actual DB schema.
  Code που βασίζεται σε TS non-null assumptions μπορεί να σπάσει
  σε runtime σε orphan/legacy data.

  Mitigation εν τω μεταξύ: Endpoint design αξιοποιεί Supabase
  runtime validation αντί TS guarantees — άρα Phase B.1a είναι
  safe.

  Action plan:
  1. Audit ΟΛΩΝ των tables στο types.ts vs information_schema.columns
  2. Document drift per table
  3. Manual types.ts corrections (preserves hand-crafted constraint
     από PROJECT_RESUME.md memory)
  4. Re-verify με tsc + smoke test affected paths

  Estimated: M-L (4-8 ώρες audit + corrections, multi-PR αν χρειαστεί)

  Required before multi-tenant onboarding — δεν θέλουμε σύλλογο να
  πέσει σε runtime error από schema drift που υπολανθάνει.

- [ ] **🔴 Dual-admin pattern + SyllogosHub recovery email convention**

  Discovered: 2026-05-12 (test-club-2 onboarding, single-point-of-failure
  realization κατά τη συζήτηση multi-tenant operations).

  **Problem:** Single-admin clubs έχουν single point of failure: αν
  ο πρόεδρος χάσει access (ξεχάσει password, χάσει email account,
  hostile takeover μετά από εκλογές, αδυναμία επικοινωνίας), ο
  σύλλογος γίνεται **unrecoverable** χωρίς manual super admin
  intervention στο Supabase auth panel. Αυτό δεν είναι production-
  acceptable για paying SaaS.

  **Στόχος:** Κάθε σύλλογος έχει **2 admins από day-1**:
  - **President admin** — ο πρόεδρος του ΔΣ (φυσικό πρόσωπο,
    real email)
  - **Backup admin** — recovery account ελεγχόμενο από SyllogosHub
    operations (synthetic email: `info@<slug>.syllogoshub.gr`)

  ---

  **1. Email naming convention**

  - SyllogosHub-owned domain: `*.syllogoshub.gr` (subdomain per club)
  - Per-club backup email: `info@<club-slug>.syllogoshub.gr`
    * Παράδειγμα: `info@kriton-aigaleo.syllogoshub.gr`
    * Παράδειγμα: `info@test-club-2.syllogoshub.gr`
  - DNS setup: Wildcard MX record για `*.syllogoshub.gr` → central
    recovery mailbox (probably catch-all → `recovery@syllogoshub.gr`)
  - **Open questions:**
    * Shared inbox ή per-club inbox; (security vs operability tradeoff)
    * Auto-rotation password schedule; (90-day rotation = overhead vs
      static = breach risk)
    * Storage: 1Password vault "SyllogosHub Recovery Accounts"
      με per-club entries

  ---

  **2. Schema considerations**

  Δύο alternatives — απόφαση εκκρεμεί:

  **Option A — `is_hub_admin` boolean flag στο `members`**
  - Νέα column: `members.is_hub_admin boolean default false`
  - Pros:
    * Explicit, queryable easily ("ποιοι members είναι SyllogosHub
      recovery accounts cross-club;")
    * Distinct από `is_board_member` / `is_president`
    * Simple RLS predicates
  - Cons:
    * Ένα ακόμα boolean flag στον schema (already crowded)
    * Διαρκής maintenance σε δύο axes (role + flag)

  **Option B — System role "SyllogosHub Recovery"**
  - Νέο role στο `member_roles` (system-level, special scope)
  - Permission scope: all modules read+write + admin override
  - Pros:
    * Extensible — μελλοντικά roles χωρίς schema changes
    * Audit trail από `member_role_assignments`
    * Cleaner separation of concerns
  - Cons:
    * Roles είναι per-club σήμερα — χρειάζεται global role concept
      (cross-cutting schema change)
    * Πιο πολλή dev work upfront

  **Decision pending.** Option A πιο pragmatic short-term, Option B
  cleaner long-term. Probably ξεκινάμε με A και migrate σε B όταν
  χρειαστεί 3ος global role.

  ---

  **3. Form refactor — /admin/clubs/new**

  Σήμερα: 1 section "Διαχειριστής (Πρόεδρος)". Πρέπει να γίνει 2:

  - **Section 1: Πρόεδρος ΔΣ** (current fields, no change)
    * Όνομα, Επώνυμο, Email, Κωδικός
  - **Section 2: Backup Admin (SyllogosHub Recovery)**
    * Email — auto-suggest από slug: `info@<slug>.syllogoshub.gr`
      (read-only ή editable με override checkbox)
    * Κωδικός — auto-generate (cryptographically secure, 16+ chars,
      copy-to-clipboard button)
    * Notes field για disambiguation (π.χ. "Recovery — 1Password
      vault SyllogosHub")

  UX: Collapsible "Advanced" toggle πιθανόν, ώστε standard flow
  να μη φοβίζει νέους super admins. Default expanded όμως — backup
  admin ΔΕΝ είναι optional, είναι required.

  ---

  **4. seedClub.ts vs route.ts integration**

  Το backup admin creation **ΔΕΝ** μπαίνει στο `seedClub.ts` —
  ο seeder είναι generic per-club bootstrap data, και ο backup
  admin είναι caller-supplied (όπως ο πρόεδρος σήμερα).

  Νέα ροή στο POST /api/admin/clubs:
  - Step 6 (current): create president auth user
  - **Step 6b (νέο):** create backup admin auth user (parallel)
  - Step 7 (current): INSERT president member row
  - **Step 7b (νέο):** INSERT backup admin member row με
    `is_hub_admin=true` (per Option A)
  - Step 9 (current): assign Πρόεδρος ΔΣ role στον president
  - **Step 9b (νέο):** assign Πρόεδρος ΔΣ role και στον backup
    admin (full permissions για recovery scenarios)

  Partial failure logging πρέπει να καλύψει και τα δύο user/member
  pairs.

  ---

  **5. Migration plan — kriton-aigaleo (existing club)**

  kriton-aigaleo είναι σήμερα το single producing client και έχει
  **μόνο τον πρόεδρο** — δεν υπάρχει backup admin. Πρέπει:

  1. **Email provisioning:** δημιουργία
     `info@kriton-aigaleo.syllogoshub.gr` στο DNS/mail provider
  2. **Auth user:** INSERT μέσω Supabase admin client (mirror του
     POST /api/admin/clubs Step 6 pattern)
  3. **Members row:** INSERT με `club_id`, `user_id` linkage,
     `is_hub_admin=true`, `first_name="SyllogosHub"`,
     `last_name="Recovery"`
  4. **Role assignment:** "Πρόεδρος ΔΣ" role για full access
  5. **Credentials handoff:** auto-generated password → 1Password
     vault "SyllogosHub Recovery Accounts" → entry
     "kriton-aigaleo"
  6. **Verification:**
     * Login με backup credentials → επιτυχία
     * Sidebar shows all 7 modules
     * Audit log entry στο kriton-aigaleo (login event)
  7. **President notification:** email στον πρόεδρο εξηγώντας
     ότι υπάρχει SyllogosHub recovery account (transparency)

  Migration script: standalone Node.js / SQL combo, **όχι** μέσω
  /admin/clubs/new (που είναι για new clubs). Πιθανώς
  `scripts/provision-backup-admin.ts` που τρέχει manually από
  super admin per existing club.

  ---

  **Estimated:** L (3 PRs minimum)
  - PR α': Schema decision + types.ts updates (Option A vs B)
  - PR β': Form refactor + route.ts dual creation
  - PR γ': Migration script + kriton-aigaleo backfill

  **Required before multi-tenant onboarding.** Δεν προχωρούμε σε
  νέα clubs χωρίς dual-admin guarantee — single-admin clubs είναι
  technical debt που θα μας κυνηγήσει.

  **Connects με:**
  - PR #62: Identity model bugs (sibling — recovery scenarios assume
    working linkage, που το #64 fixed για new clubs)
  - PR #64: seedClub linkage fix (πρώτο βήμα προς robust onboarding —
    αυτό extends το ίδιο pattern σε dual-admin)
  - Email naming convention overlaps με future "tenant subdomain"
    architecture (αν ποτέ πάμε σε `<slug>.syllogoshub.gr` per-tenant
    URLs)

## 🟡 High Priority (post-beta)

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

- [ ] **🟡 Date format inconsistency στο /finances payment modal**

  Discovered: 2026-05-12 (Phase B.1a smoke testing)

  Symptom: Στο "Νέα Πληρωμή" modal, το date input εμφανίζει
  '05/12/2026' (Δεκ 5 αν US format MM/DD/YYYY ή Μαϊ 12 αν Greek
  DD/MM/YYYY).

  Στη DB αποθηκεύεται ως 2026-05-12 — άρα το input είναι σε US
  format. Πιθανότατα bug για Greek users που περιμένουν
  DD/MM/YYYY convention.

  Affects:
  - app/finances/page.tsx (Νέα Πληρωμή modal)
  - Πιθανώς και άλλα date inputs στο app (events, members
    birth_date, etc.)

  Fix candidates:
  - Σήμανση locale="el-GR" σε όλα τα <input type="date">
  - Ή custom date picker με explicit Greek format
  - Audit όλων των date inputs cross-app

  Estimated: S-M (UI scope, no schema change)

- [ ] **🟢 /admin/clubs/new UX polish (2 quick wins)**

  Discovered: 2026-05-12 (test-club-2 onboarding)

  Σήμερα: Form δουλεύει functionally αλλά έχει 2 obvious UX gaps
  που πιάνεις στην πρώτη χρήση.

  **A) Auto-generate slug από όνομα**
  - Σήμερα: User πληκτρολογεί name + slug χειροκίνητα.
    Risk: typos, inconsistency, friction.
  - Στόχος: live auto-generate slug ενώ ο user πληκτρολογεί name.
  - Implementation:
    * Greek transliteration: 'ΣΥΛΛΟΓΟΣ ΔΟΚΙΜΗΣ' → 'syllogos-dokimis'
      (greek-utils, transliteration lib, ή custom map)
    * Lowercase + alphanumeric + hyphens (matches existing slug regex)
    * Manual override: dirty flag — αν user editάρει το slug,
      σταματά το auto-generate
    * onBlur trigger για σταθερότητα (avoid bouncing real-time)
    * Bonus: live uniqueness check μέσω debounced API call

  **B) Password visibility toggle (👁 ματάκι)**
  - Σήμερα: <input type="password"> κρύβει characters
    permanently — admin δεν μπορεί να επιβεβαιώσει τι έγραψε
  - Στόχος: Toggle button (👁/🙈) που flip-άρει type='password'
    ↔ type='text'
  - Implementation:
    * useState για showPassword boolean
    * Eye icon button στο right side του input
    * Default state: hidden (security default)
    * Πρόσβαση accessibility: aria-label "Εμφάνιση κωδικού" /
      "Απόκρυψη κωδικού"
    * Mirror του Member Portal login page αν εκεί ήδη υπάρχει

  Affects: app/admin/clubs/new/page.tsx (πιθανώς και άλλα forms
  που έχουν password inputs — audit candidate)

  Estimated: S (~1 ώρα και τα δύο combined)

- [ ] **🟢 Welcome email follow-ups**

  Discovered: 2026-05-12 (αρχική υλοποίηση welcome email στο
  POST /api/admin/clubs Step 10).

  Το αρχικό welcome email στέλνεται μετά τη δημιουργία club από
  το /admin/clubs/new (super admin panel). Fail-soft — Resend
  outage δεν blockάρει club creation, `emailSent` flag στο response.

  Τρία follow-ups που τα ξεχωρίσαμε για επόμενες PRs:

  **A) Magic link version (post dual-admin)**
  - Σήμερα: welcome email περιέχει login URL + reminder ότι ο
    κωδικός έχει ανακοινωθεί χωριστά (security: never plaintext
    στο email)
  - Στόχος: passwordless first-login μέσω magic link (mirror του
    portal flow)
  - Blocker: εξαρτάται από το dual-admin pattern. Όταν θα υπάρχει
    backup admin με auto-generated password, το magic link γίνεται
    proper UX για τον πρόεδρο.
  - Implementation: νέο `app/admin/auth-callback/page.tsx` ή
    extend του portal callback με `?next=/admin`
  - Estimated: S-M

  **B) Resend welcome endpoint (super admin re-trigger)**
  - Σήμερα: αν ο admin δεν λάβει το email (spam, typo, Resend
    failure), δεν υπάρχει UI να ξανασταλεί
  - Στόχος: button στο /admin/clubs/[id]/page.tsx → POST
    /api/admin/clubs/[id]/resend-welcome
  - Idempotency: trivial (email μόνο, δεν αλλάζει state)
  - Estimated: S (small endpoint + button)

  **C) Forgot password flow (general blocker)**
  - Σήμερα: δεν υπάρχει self-service recovery για admins
    (verified — κανένα route σε `app/forgot-password`, `app/auth`,
    ή reference σε `resetPasswordForEmail`)
  - Στόχος: standard Supabase `resetPasswordForEmail` flow
    * `/forgot-password` page (email input)
    * `/reset-password` page (token verification + new password)
    * Email template via Supabase ή custom Resend
  - Affects: ολόκληρο το auth model (admins + future portal users)
  - Σε σχέση με το welcome email: αν υπάρχει forgot-password, το
    welcome email μπορεί απλά να γράφει "Αν έχεις πρόβλημα σύνδεσης,
    χρησιμοποίησε το forgot password" αντί για το σημερινό
    "επικοινώνησε με τον admin"
  - Estimated: M (2-3 routes + 2 pages + email template)
  - Connects με: ROADMAP entry 🔴 Dual-admin pattern — backup
    admin πρέπει να έχει working recovery path

  Estimated combined: M (~1 week dev για όλα τα 3)

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

### 🌐 Public Engagement domain

- [ ] **🌐 Public Lead Capture — Phase 1 (Foundation)**

  Stack: 🌐 Public Engagement

  Strategic context: Σύλλογοι θέλουν να μαζεύουν στοιχεία επικοινωνίας
  από outsiders (φίλοι μελών, επισκέπτες εκδηλώσεων, web visitors)
  για μελλοντικές προσκλήσεις, newsletter, recruitment. Στόχος:
  ενιαία λύση που υποστηρίζει 3 sources από day-1, με GDPR compliance.

  **Spec — Schema (Migration TBD):**
  - Νέα table `subscribers` με columns:
    * `id` (uuid pk)
    * `club_id` (uuid FK → clubs, NOT NULL)
    * `first_name`, `last_name` (text)
    * `email`, `phone` (text)
    * `source` enum: `'qr_general'` | `'qr_event'` | `'qr_member_referral'` | `'manual_admin'` | `'website'`
    * `source_event_id` (uuid FK → events, nullable)
    * `source_member_id` (uuid FK → members, nullable)
    * `consent_communications` boolean (required)
    * `consent_newsletter` boolean (optional)
    * `unsubscribed_at` timestamptz (nullable)
    * `status` enum: `'new'` | `'contacted'` | `'converted'` | `'unsubscribed'`
    * `converted_to_member_id` (uuid FK → members, nullable)
    * `notes` text, `created_at`, `updated_at` (timestamptz)
  - Νέο module `'subscribers'` στο `club_modules` CHECK constraint
    (7 modules → 8)
  - RLS off (consistent με project pattern)
  - Indexes:
    * `(club_id, status)` — admin list filtering
    * `(source)` — source breakdown analytics
    * `(club_id, email)` partial unique όπου `email IS NOT NULL` —
      dedup per club

  **Spec — Public flow:**
  - `/[clubSlug]/welcome` page με club branding (logo + μπορντό CTA)
  - Form fields: όνομα, επώνυμο, email, τηλέφωνο
  - 2 consent checkboxes (communications **required**, newsletter
    optional)
  - Privacy policy link
  - Dynamic welcome message based on `?ref=` param:
    * Generic: "Καλώς ήρθες στον [Σύλλογος]"
    * Event: "Σε ευχαριστούμε που ήρθες στον [Εκδήλωση]"
    * Member: "Ο/Η [Όνομα Μέλους] σε καλωσορίζει στον σύλλογο"
  - `POST /api/public/subscribe` με rate limiting (anti-spam)
  - Confirmation page μετά submit

  **Spec — Admin flow:**
  - `/subscribers` page στο Διαχειριστικό zone του sidebar
  - List με filters: status, source, date range, search
  - Columns: όνομα, email, τηλέφωνο, source (με referrer name αν
    member), date, status, actions
  - Actions: mark contacted, mark converted (opens member create
    form prefilled), delete
  - CSV export
  - Permission gate: νέο `'subscribers'` module permission

  **Spec — Member QR (Portal):**
  - `/portal/profile` προσθέτει card "Το προσωπικό σου QR"
  - "Λήψη εικόνας PNG" + "Αντιγραφή link"
  - QR encodes: `https://<club>.syllogoshub.gr/welcome?ref=member_<uuid>`

  **Spec — Per-club QR (Settings):**
  - `/settings/club` section "QR Codes"
  - Download generic QR (no ref param)
  - Future: download per-event QR (Phase 2)

  **GDPR considerations:**
  - Privacy policy page per club
  - Right to unsubscribe (public `/[clubSlug]/unsubscribe` page)
  - Right to be forgotten (admin delete cascades, audit trail)
  - Data export (Phase 2 — admin can email user their data)

  Estimated: M-L (multi-session — schema + public page + admin
  page + portal integration + GDPR pages)

  Connects με: `club_modules`, member portal Chunk 2, audit log
  foundation, future communications module

- [ ] **🌐 Public Lead Capture — Phase 2 (Member referral + conversion)**

  Stack: 🌐 Public Engagement

  Spec:
  - Member leaderboard "Top Recruiters" στο `/subscribers` admin page
  - Per-event QR generator (download/print από event page)
  - Convert-to-member flow: admin click "Προώθηση σε μέλος" στον
    subscriber → opens `/members` create form prefilled με data
    → on member create, `subscriber.status='converted'` +
    `converted_to_member_id` linkage
  - Email notification στο μέλος που έκανε το referral όταν ο
    subscriber γίνει μέλος ("Ευχαριστούμε για το referral!")

  Estimated: M

- [ ] **🌐 Public Lead Capture — Phase 3 (Email campaigns)**

  Stack: 🌐 Public Engagement

  Spec:
  - Mass email send μέσω Resend (chunked για rate limiting)
  - Email templates per club
  - Newsletter list με opt-in segmentation
  - Unsubscribe link σε κάθε email (one-click)
  - Send analytics (sent, delivered, opened, clicked)
  - Connects με `club_modules.communications` που ήδη υπάρχει

  Estimated: L

### 🟣 Member Portal domain

> Stack description βλ. 🏗️ Architectural Stacks → 🟣 Member Portal Stack.
> Foundation merged: Chunk 2 — Auth + Profile (PR #44, 2026-05-09).

- [ ] **Chunk 3 — Member Events + Finances**

  Stack: 🟣 Member Portal

  Scope: Visibility σε events + financial state του μέλους.

  Spec:
  - /events public view για member (όλες οι εκδηλώσεις του συλλόγου)
  - Member's reservations history (μετά + πριν)
  - /finances/me — οφειλές + πληρωμές history
  - Status badge (ενεργό/ανενεργό) με reason
  - Member sees ΟΧΙ amounts of others, μόνο δικά του

  Connects με: events domain, finances domain, RLS policies,
  Chunk 2 portal foundation (PR #44)

  Estimated: L

- [ ] **Chunk 4 — Departments + Classes + Messages**

  Stack: 🟣 Member Portal

  Scope: Class enrollment + announcements per τμήμα.

  Spec (απαιτείται νέο schema):
  - classes table (department_id FK, schedule, location, instructor)
  - class_enrollments table (class_id, member_id, enrolled_at)
  - department_messages table (department_id, title, body, posted_by, posted_at)
  - /departments/[id] page για members
  - Family-wide visibility (parent βλέπει παιδιά τους εγγεγραμμένα)
  - Push notifications για νέα μηνύματα

  Connects με: departments, family system, push notifications

  Estimated: XL (multi-session — απαιτεί schema design)

- [ ] **🟣 Duplicate email στο members table — portal linkage edge case**

  Stack: 🟣 Member Portal · Edge case

  Discovered: 2026-05-13 (SQL diagnostic για Bug #2 backfill task)

  Real example στο kriton-aigaleo: 3 members
  (ΕΜΜΑΝΟΥΗΛ ΚΟΥΡΟΥΓΚΙΑΟΥΡΗΣ, ΓΕΩΡΓΙΑ ΚΟΥΡΟΥΓΚΙΑΟΥΡΗ,
  ΙΩΑΝΝΗΣ ΚΟΥΡΟΥΓΚΙΑΟΥΡΗΣ) μοιράζονται email
  `manevak@gmail.com`. Κλασικό σε ελληνικές οικογένειες όπου ένα
  email είναι shared μεταξύ συγγενών χωρίς ατομικό account.

  **Behavior gap:**
  - Σήμερα `linkAuthUserToMember()` (από PR #44) δεν είναι ξεκάθαρο
    πώς αντιμετωπίζει duplicate emails — πιθανώς picks first match
    ή throws error.
  - Όταν μέλος της οικογένειας κάνει `/portal/login` με το shared
    email, undefined behavior.

  **Required investigation:**
  1. Read `lib/auth/portalAuth.ts` → `linkAuthUserToMember()` logic
  2. Decide: error, pick-first, ή "choose which member" UI flow
  3. Implement chosen approach με fallback safety

  Estimated: M (investigation + decision + implementation)

  Connects με: Member Portal Chunk 2 (PR #44), PR #39 email
  verification, family domain

  **Low frequency edge case** — δεν θα εμφανιστεί μέχρι κάποιος
  της οικογένειας Κουρουγκιαούρη ενεργοποιήσει portal. Defer μέχρι
  user demand demonstrated ή πριν multi-tenant launch.

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

### 🔍 Audit & Monitoring

- [ ] **🔍 Cross-table audit foundation (multi-PR program)**

  Stack: 📊 Διαχειριστικό · Priority: HIGH

  Strategic context: Audit subsystem ολοκληρώθηκε για members table
  (PRs #49/50/51/56/57/58). Generic schema (audit_log.table_name)
  είναι έτοιμο για επέκταση σε όλα τα domains.

  **Blocker εντοπίστηκε στο PR #59 attempt (2026-05-11):**
  Πολλά admin domains (events, reservations, finances, sponsors,
  departments) **δεν έχουν API update routes** — mutations γίνονται
  client-side direct μέσω Supabase. Άρα audit hooks ΔΕΝ μπορούν
  να μπουν χωρίς refactor.

  **Anti-pattern να αποφύγουμε:** Client-side audit calls — actor
  identity + service role bypass δεν είναι safe από browser.

  **Sequential rollout plan (ένα PR ανά domain):**

  Phase A.1 ✅ DONE (PR #60, merged 2026-05-11):
  - app/api/events/[id]/route.ts (PATCH) + audit hook
  - EVENT_FIELD_LABELS, requirePermission helper, foundation modules
  - Pattern established για όλες τις επόμενες φάσεις

  Phase A.2 PENDING (separate PR, ~2-3 ώρες):
  - Migrate 8 client sites από .from('events').update(...) σε
    fetch('/api/events/[id]', { method: 'PATCH', ... }):
    * app/events/page.tsx (main admin)
    * app/seating/page.tsx
    * app/seating/entrance-list/page.tsx
    * app/calendar/page.tsx
    * app/cashier/[eventId]/page.tsx
    * app/finances/EventDashboardTab.tsx
    * app/admin/clubs/[id]/page.tsx
    * components/EventSummaryPanel.tsx
  - Smoke test ανά site
  - Verify audit entries γράφονται σε κάθε mutation
  - Estimated: M (~2-3 ώρες, multi-commit, client-only changes)

  Phase A.3 PENDING (cross-table audit UI):
  - Επεκταση /audit-log page να εμφανίζει events audit entries
    (όχι μόνο members)
  - Table filter dropdown
  - Field labels dispatcher (getFieldLabel(tableName, field))
  - Estimated: M

  Phase B: finances (transactions)
  - app/api/finances/transactions/[id]/route.ts (or similar)
  - Migrate client sites
  - TRANSACTION_FIELD_LABELS
  - Estimated: L

  Phase C: reservations + attendees
  - Similar pattern, attention σε real-time mutations από
    seating page (multiple concurrent edits)
  - Estimated: L

  Phase D: sponsors + departments + clubs settings
  - Lower frequency, smaller surface
  - Estimated: M per domain

  **Pattern reference (από PR #56/#58):**
  - logChange με tableName + record_id + action + actor_label
  - actor_label='admin' για admin context (αντί 'self_via_token')
  - Smarter idempotency guard για field-diff scenarios
  - Per-table FIELD_LABELS module (πιθανώς νέα structure
    σε lib/audit/labels/<table>.ts)

  **Architectural decision pending:** Single FIELD_LABELS map
  (collision risk) ή per-table modules (scalable). Decide όταν
  ξεκινήσει Phase A.

  Connects με: PR #44 RLS overhaul (production blocker — RLS
  policies needed πριν multi-table audit goes live).

  Estimated total program: XL (8-15 PRs ανάλογα με rollout cadence)

- [ ] **Audit log filters (Phase 3 part 2)**
  - Time window dropdown: 7/15/30/90/all (default 15)
  - Actor type filter: admin / self_via_portal / self_via_token
  - Click member name στο /audit-log → opens MemberModal
    με Ιστορικό tab pre-selected (cross-page navigation)
  - Estimated: M (3-4 commits)
  - Connects με: PR #51 base

- [ ] **Audit admin coverage**
  - Refactor admin /members update flow από client-side
    direct Supabase σε API route + audit hook
  - Currently admin updates ΔΕΝ καταγράφονται — μόνο
    self-updates μέσω /me/[token] + /portal/profile
  - Δεν χρειάζεται schema change
  - Estimated: M-L (4-5 commits)
  - Connects με: PR #49 audit foundation

- [ ] **Audit για άλλα tables**
  - Επέκταση audit hooks σε events/finances/sponsors
    update routes
  - Schema είναι ήδη generic (record_id + table_name)
  - Future PRs ανά domain (1 PR ανά table)
  - Estimated: L (multi-PR series)

- [ ] **🔔 Bell notification για unread audit changes**
  - Sidebar bell icon με count των unviewed entries
  - Click → /audit-log με filter για new only
  - Σχετίζεται με future audit features
    (πληρωμές, system events)
  - Estimated: M (icon + counter + viewed-state tracking)

- [ ] **/audit-log pagination**
  - "Δες παλαιότερα" button ή scroll-based loading
    όταν φτάσουν τα 100 entries
  - Trigger: όταν users αναφέρουν ότι δεν βλέπουν
    παλαιότερα changes
  - Estimated: S (offset-based) ή M (cursor-based)

### 📋 Self-update form domain

- [ ] **Address split** (οδός / αριθμός / Τ.Κ.)
  - Schema migration: 1 column → 3 columns
  - Data migration για existing 244+ members ΕΚΑ + ΣΚΑ
    (manual splitting όπου γίνεται, leave-as-is όπου όχι)
  - Foundation για:
    - Maps integration (geocoding με ακριβή διεύθυνση)
    - Τ.Κ.-based queries (statistics, mailing zones)
    - Online αίτηση schema design
  - Estimated: M (multi-commit: schema + UI + data migration)

- [ ] **Member photo upload**
  - Schema: members.photo_url text nullable
  - Storage bucket: club-assets/photos/{member_id}.{ext}
  - Reusable <MemberPhotoUpload> component σε:
    - /portal/profile (self-managed)
    - /me/[token] (first-time setup)
    - Admin /members modal
    - Future: online αίτηση
  - Estimated: M (component + storage policy + 4 sites)

- [ ] **Section grouping σε self-update forms**
  - ΠΡΟΣΩΠΙΚΑ / ΕΠΙΚΟΙΝΩΝΙΑ / ΟΙΚΟΓΕΝΕΙΑ visual sections
  - Mirror της structure στην έντυπη αίτηση μέλους
    (AITHSH_MELOUS PDF)
  - Affects: /me/[token] form + /portal/profile ProfileEditForm
  - Estimated: S (CSS + section headers, no logic change)

- [ ] **Label unification /me/[token] vs /portal/profile**
  - Drift εντοπισμένη μεταξύ των δύο surfaces:
    - 'Πατρώνυμο' vs 'Όνομα πατρός'
    - 'Μητρώνυμο' vs 'Όνομα μητρός'
    - 'Πατρικό επώνυμο' vs 'Γένος (πατρικό επώνυμο)'
  - Same data fields, διαφορετικά labels — confusing UX
    για member που χρησιμοποιεί και τις δύο surfaces
  - Estimated: S (decide source of truth + label sync)

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

### 🟣 Member Portal (future)

- [ ] **Member portal post-login return-to (deferred — premature)**

  Stack: 🟣 Member Portal · Tech Debt

  Discovered: 2026-05-13 (post PR #76 follow-up investigation)

  Trigger condition: Όταν προστεθεί 2η+ protected page στο
  `/portal/*` (e.g., `/portal/payments`, `/portal/events`).

  Σήμερα: μόνο `/portal/profile` είναι protected. Hardcoded redirect
  σε `/portal/profile` post-magic-link = correct landing σε 100% των
  cases.

  Investigation (2026-05-13, post PR #76) επιβεβαίωσε ότι:
  - Δεν υπάρχει security gap (zero `?redirect=` consumption στο
    portal flow — κανένα component δεν διαβάζει το param)
  - Δεν υπάρχει UX gap (single protected page → hardcoded landing
    πάντα σωστό)
  - Symbolic proxy.ts fix χωρίς downstream propagation = dead code

  Όταν χρειαστεί: 4 file changes required (~M effort):
  - `proxy.ts`: add `?redirect=` στο /portal/profile anonymous block
  - `app/portal/login/page.tsx`: read + sanitize + include στο
    POST body
  - `app/api/portal/auth/send-magic-link/route.ts`: accept optional
    `redirect` field, sanitize, append στο `magicLinkUrl`
  - `app/portal/auth-callback/page.tsx`: read + sanitize + use στο
    `redirect()` call (αντί hardcoded `/portal/profile`)

  Reuse: `lib/auth/safeRedirect.ts` (PR #76)

  Sanitization στο API layer **απαιτείται** — magic link email
  είναι attacker-controllable vector (αν attacker αποκτήσει inbox
  access, μπορεί να craft-άρει redirect σε phishing landing).

  Estimated: M (4 files + API-layer sanitization)

  Connects με: PR #76 (open redirect closure στο /admin flow),
  Member Portal Chunk 3/4 expansion

### 🌐 Public Engagement (future)

- [ ] **🌐 Public Lead Capture — Phase 4 (SMS)**

  Stack: 🌐 Public Engagement

  Spec:
  - SMS notifications μέσω Greek SMS gateway (TBD provider)
  - Opt-in consent ξεχωριστό από email
  - Subset functionality του Phase 3 (announcements, event reminders)
  - Cost per send → club billing implications

  Estimated: L
  Defer until: email campaigns (Phase 3) stable σε production +
  user demand demonstrated

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

- [ ] **🧹 requireSuperAdmin parity refactor**

  Stack: 📊 Cross-cutting auth

  Strategic context: PR #60 εγκαθίδρυσε pattern errorResponse
  helper που standardizes JSON error envelope για όλα τα auth
  helpers. resolveAuthMember + requireAdmin + requirePermission
  το χρησιμοποιούν.

  Gap: requireSuperAdmin.ts διατηρεί 3 raw 'throw new Response'
  calls (lines 31, 45, 52). Inconsistent με υπόλοιπη auth layer.

  Refactor:
  - Add import errorResponse from './errorResponse'
  - Replace 3 throws με errorResponse() calls
  - Verify με grep ότι 0 raw 'throw new Response' παραμένουν στο
    lib/auth/

  Trade-off: Minor consistency improvement. Παραμένει functional
  ως έχει — δεν έχει user-facing impact. Worth doing όταν επόμενη
  φορά αγγίξουμε super admin paths.

  Estimated: XS (10 λεπτά)
  Connects με: PR #60 errorResponse helper

- [ ] **Family search reverse-name consistency**
  - app/members/page.tsx:1640-1649 ελέγχει μόνο "last first",
    όχι reverse "first last"
  - Όλα τα άλλα people-search sites (AttendeesEditor, calendar)
    ελέγχουν και τις 2 κατευθύνσεις
  - Minor UX inconsistency εντοπισμένη κατά το PR #55 pre-flight
  - Estimated: XS (1 line edit + smoke test)

- [ ] **Sponsor search helper consolidation**
  - 2 sponsor sites χρησιμοποιούν διαφορετικά helpers + surfaces:
    * app/finances/SponsorsPanel.tsx: sponsorListName(s) — name-only
    * app/settings/club/sponsors/page.tsx: displayName(s) + contact_phone + contact_email
  - Drift εντοπισμένο στο PR #55 — flag για future single source of truth
  - Decision needed: unify helpers ή unify search surface (broader)
  - Estimated: S

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

- [ ] **Server-side permission checks στα verification endpoints**
  - PR #39 endpoints έχουν μόνο auth.getUser() check (όχι permission)
  - Στην πράξη protected via UI page-level gate, αλλά API direct call
    bypassable
  - Add proper RLS-based or role-based check στα:
    * /api/members/[id]/send-verification-email
    * /api/members/send-verification-bulk
  - Connects με: RLS policies (production blocker)
  - Estimated: S

- [ ] **Drop `clubs.branding` jsonb column (duplicate)**
  - Schema drift: branding existence σε ΔΥΟ tables
    * clubs.branding (jsonb με logo_url + primary_color)
    * club_settings (full row με logo_url, primary_color, secondary_color, accent, theme_preset, ...)
  - club_settings είναι το source of truth (χρησιμοποιείται από /settings/club UI)
  - clubs.branding είναι orphan, sync-εμένο manually σήμερα για το PR #39
  - Refactor: drop clubs.branding column + remove from app code
  - Estimated: S

- [ ] **Rate limiting για bulk verification send**
  - Resend free tier: 2/sec sustained, 10/sec burst
  - Σήμερα δουλεύει για 8 emails (kriton-aigaleo)
  - Όταν φτάσουμε >100 unverified σε ένα σύλλογο, σπάει
  - Solution: chunk + delay, ή Resend bulk API
  - Estimated: S

- [ ] **Domain transition: hub.party4u.gr → syllogoshub.gr**
  - Όταν ολοκληρωθεί το syllogoshub.gr setup
  - Verify νέο domain στο Resend (νέα DNS records)
  - Update env vars (RESEND_FROM_EMAIL, NEXT_PUBLIC_APP_URL)
  - Vercel redirect από old domain για ήδη-σταλμένα /me/[token] links
  - Estimated: S

- [ ] **Migration safety conventions** (process, όχι code)
  - Snapshot pattern με `create table as select` αντιγράφει ΜΟΝΟ data, όχι FKs/constraints
  - Για schema rollback: χρησιμοποίησε authentic migration files, όχι rename backup
  - Pre-flight diagnostic queries πριν από κάθε destructive SQL operation
  - Κλείνουμε rollback/scratch tabs στο SQL Editor μόλις ολοκληρωθεί migration
  - Ποτέ destructive SQL χωρίς full block review πριν paste
  - Rollback SQL ΔΕΝ μπαίνει σε chat ως "comment to keep handy" (risky paste)
  - Document αυτές τις conventions σε `docs/MIGRATIONS.md` (όταν γίνει)
  - Estimated: S (write doc + add to README)

## 🔧 Tech Debt

- [ ] **AppShell session-mismatch redirect**
  Όταν admin κάνει login ως member σε άλλο tab, η admin
  session αντικαθίσταται. Στο πρώτο tab (admin) ο shell
  χάνει context. Fix: redirect σε /login αν useRole δεν
  επιστρέφει admin permissions στις admin routes.
  Estimated: S

- [ ] **Migration safety: pre-flight smoke test admin pages
       όταν αλλάζουμε AppShell**
  Lesson από PR #45: regression test σε admin paths όταν
  αλλάζεις AppShell guards. Process improvement, όχι code.
  Estimated: process note

- [ ] **uuid validation guard στο /admin/clubs/[id]/page.tsx**
  Όταν το dynamic `[id]` segment δεν είναι valid uuid, η Postgres
  γυρνάει 22P02 και ο user βλέπει 500 server error. Σωστή
  συμπεριφορά: uuid format check στην αρχή του page → `notFound()`
  για 404. Πιθανώς αξίζει shared helper για όλα τα dynamic
  `[id]` routes.
  Estimated: XS

- [ ] **Migrate από legacy Supabase anon/service_role keys σε
       publishable/secret keys**
  Supabase recommendation (2026 dashboard notice). Σήμερα
  χρησιμοποιούμε legacy keys:
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → publishable key
  - `SUPABASE_SERVICE_ROLE_KEY` → secret key
  Defer μέχρι (α) Supabase ανακοινώσει breaking change ή (β)
  dedicated tech debt session. Απαιτεί env var rename σε Vercel
  + local `.env*` + code references + redeploy.
  Estimated: M

## ✅ Recently Done

### fix/sw-exclude-authenticated-paths (merged 2026-05-13) — PR #68

Production blocker fix για το super admin /admin/clubs που
redirect-αρε σε /login από stale SW cache.

**Changes (app/sw.ts):**
- NetworkOnly handler για /admin, /api/admin, /portal, /api/portal,
  /me/, /api/me/ (placed first σε runtimeCaching — matching order
  matters, αλλιώς οι NetworkFirst rules του defaultCache τυλίγουν
  authenticated responses).
- skipWaiting: false → true για άμεσο SW update σε existing clients
  που έχουν installed την παλιά version.
- One-time activate cleanup των `pages-rsc`, `apis`,
  `pages-rsc-prefetch` caches που πιθανώς περιείχαν stale
  authenticated responses από προηγούμενες versions.

**Παράλληλο discovery:** missing `SUPABASE_SERVICE_ROLE_KEY` στο
Vercel production environment. Καμία αλλαγή κώδικα — μόνο env var
addition + redeploy. Πιθανές παράπλευρες συνέπειες σε άλλα admin
paths που εξαρτώνται από `getAdminClient()` — audit pending αν
εμφανιστούν σιωπηλά issues.

**Production-verified end-to-end:** /admin/clubs φορτώνει σωστά,
ΣΥΛΛΟΓΟΣ ΚΡΗΤΩΝ ΑΙΓΑΛΕΩ visible στη λίστα.

**Resolves:** 🔴 Identity model bugs — Bug #1 (1 από 5).

### feat/payments-audit-patch (merged 2026-05-12)

Phase B.1a — PATCH endpoint για payments table. Mirror του events
PATCH pattern (PR #60). 3 commits + smoke testing.

**Schema (1 commit):**
- [x] Migration 0024: audit_log.action CHECK constraint expansion
  ('payment.approved', 'payment.rejected' added)
- [x] Defensive snapshot audit_log_backup_20260512_pre_payments
- [x] Manual SQL execution στο production με 4-block verification

**Types & Labels (1 commit):**
- [x] AuditAction union expansion: + 'payment.approved' | 'payment.rejected'
- [x] Pre-existing drift fix: 'insert' (TS) → 'create' (DB alignment).
  Dead literal — 0 call sites confirmed via grep.
- [x] AUDIT_ACTION_LABELS: rename 'insert' → 'create', + 2 payment
  actions (Έγκριση πληρωμής / Απόρριψη πληρωμής)
- [x] New PAYMENT_FIELD_LABELS export: amount, payment_date, period,
  original_amount (4 fields, Greek labels)
- [x] 'type' deliberately excluded από PAYMENT_FIELD_LABELS (D2
  decision: immutable σε edit semantic change)

**Endpoint (1 commit):**
- [x] app/api/finances/payments/[id]/route.ts — PATCH method
  * Auth: requirePermission('finances')
  * Multi-tenant scoping: .eq('id', id).eq('club_id', ctx.clubId)
    σε ΟΛΕΣ τις queries (defense-in-depth)
  * Whitelist: amount, payment_date, period, original_amount
  * Per-field validation με Greek messages
  * Validation rules: amount/original_amount finite ≥0 ≤9999999,
    payment_date parseable ISO, period trimmed ≤50 chars
  * Audit hook: action='update', actor_label='admin', field diff
  * Fail-soft audit, empty-diff skip
  * cast to PaymentUpdate (runtime-built object)

**Production smoke-tested (7/7 ✅):**
- Happy path PATCH (period change): 200 + audit row με correct
  actor identity (cfa2bdc8.../info@party4u.gr)
- Validation error (negative amount): 400 + Greek field-level message
- Whitelist enforcement (type field): 400 + allowed list
- Cross-club leakage (random UUID): 404 (defense-in-depth, no 403)
- Audit row created με correct field diff jsonb
- Revert successful: full round-trip audit trail (2 rows)

**Discoveries (separate ROADMAP entries):**
- payments table schema drift εντοπίστηκε vs types.ts
  → 🔴 Critical entry
- Date format issue στο /finances Νέα Πληρωμή modal
  → 🟡 Finances entry

### feat/api-events-update (merged 2026-05-11) — PR #60

Cross-table audit foundation — Phase A.1 (events endpoint).
Πρώτο API route που establishes το pattern για cross-table audit:
auth + permission gate + tenant scoping + per-field validation +
audit hook. Foundation για 4 φάσεις rollout (A → D) σε όλα τα
admin domains.

**Foundation modules (4 commits):**
- [x] EVENT_FIELD_LABELS στο lib/audit/labels.ts (Greek translations
  για audit-able event fields, jsonb excluded)
- [x] lib/auth/permissions.ts — extracted από useRole.ts, pure
  server/client shareable logic (Permission union, ALL_PERMISSIONS,
  MODULE_TO_PERMISSION, computePermissions)
- [x] lib/auth/resolveAuthMember.ts + errorResponse.ts — auth +
  member resolution + JSON error envelope (preserves client
  contract για 20 existing admin route consumers)
- [x] lib/auth/requirePermission.ts — variadic OR permission gate
  με short-circuit για admin/president, throws Response μέσω
  errorResponse, surfaces DB errors as 500 (vs useRole silent ignore)

**Endpoint (1 commit):**
- [x] app/api/events/[id]/route.ts — PATCH method
  * Auth: requirePermission('events')
  * Multi-tenant: tenant scoping σε ΟΛΕΣ τις queries (id + club_id)
  * Whitelist: event_name, event_date, location, venue_max_capacity
    (venue_map_config jsonb excluded — Phase A.1 scope)
  * Per-field validation με Greek error messages
  * Audit hook: actor_label='admin', actor_user_id + actor_member_id
    populated, field-level diff, fail-soft, empty-diff skip
  * Next.js 16 async params pattern

**Smoke tested production-grade (5/5):**
- Happy path PATCH (null → string location): 200 + audit row με
  correct actor identity (Γιώργος ΧΡΟΝΑΚΗΣ)
- Validation error (negative capacity): 400 + Greek field-level message
- Whitelist enforcement: 400 + complete allowed list
- Non-existent event ID: 404
- Audit count post-tests: 1 (μόνο happy path γράφτηκε)

**Pivot context:** Original session goal ήταν direct cross-table
audit implementation. Στο pre-flight ανακαλύφθηκε ότι events δεν
έχει API update routes — όλες οι mutations γίνονται client-side
direct. Pivoted σε proper API endpoint creation + audit foundation,
χωρίς client migration (Phase A.2).

**Phase A.2 deferred:** Client migration σε 8 sites που σήμερα
κάνουν .from('events').update(...) απευθείας στο client. Tracked
στο cross-table audit ROADMAP entry. Estimated 2-3 ώρες, separate PR.

### feat/members-url-state (merged 2026-05-11) — PR #59

URL state persistence για το /members admin page — filters, sort,
και search επιβιώνουν σε refresh, browser back/forward, και shareable
URLs. Pivot από αρχικό cross-table audit attempt (που εντόπισε
missing API routes ως blocker — documented στο cross-table audit
ROADMAP entry).

**Foundation (1 commit):**
- [x] Suspense boundary για useSearchParams (App Router requirement)
- [x] MembersPageContent internal component + MembersPage default
  export με Suspense wrapper
- [x] MembersUrlState type + DEFAULT_URL_STATE constant
- [x] buildMembersQueryString(state) — serialize με omit-on-default
- [x] parseMembersUrlState(searchParams) — defensive fallback για
  invalid/missing params
- [x] sortColumn narrowed σε SortColumn union (type fidelity με
  existing handleSort + child component SortState props)
- [x] Validated sort param με validSortColumns array (mirror
  validStatuses defensive pattern)

**Wire-up (1 commit):**
- [x] 9 useState declarations → URL-derived state
- [x] Setter shims preserve existing call signatures (0 αλλαγές
  σε JSX call sites)
- [x] Local searchInput state για controlled input UX
- [x] 2 sync useEffects:
  * searchInput → URL (300ms debounce)
  * URL.q → searchInput (back button, shared links)
- [x] setSortBy shim supports object + callback forms
  (handleSort toggle logic preserved)
- [x] clearFilters simplified: 8 setters → 1 updateUrl, sort
  preserved (existing UX behavior)

**URL schema:**
- ?q=κλεισ&dept=χορωδια&status=active&board=1&age=child
  &family=1&unverified=1&missing=email&sort=age&order=desc
- Defaults omitted για clean URLs (no noise όταν view είναι default)

**Pattern reference:** app/finances/page.tsx — established
bidirectional URL ↔ state sync με { scroll: false } replace.

**Smoke tested (8/8 scenarios):**
- Initial clean URL ✓
- Filter changes update URL immediately ✓
- Search debounce (300ms idle) ✓
- Refresh persists all filters ✓
- Clear filters preserves sort ✓
- Sort header toggle works ✓
- Browser back restores previous state ✓
- Manual URL paste applies filters ✓

### fix/audit-hook-guard-backfill (merged 2026-05-11) — PR #58

Bug fix για audit hook guard που έπεφτε σε silent drop όταν member
είχε email_verified=true λόγω backfill (PR #56) ή pre-PR #49 era.

**Bug discovery context:**
Εντοπίστηκε στο PR #57 production smoke test:
- ΚΑΡΟΥΣΟΥ ΕΥΑΓΓΕΛΙΑ έκανε real verification σήμερα
- Audit log εμφάνιζε ΜΟΝΟ την backfill entry από 09/05
- Η σημερινή ενέργεια έπρεπε να γράφει νέα entry — δεν γράφτηκε

**Root cause:**
Παλιός guard '!member.email_verified' λάθος υπόθεση: 'αν
email_verified=true, έχει ήδη γραφτεί audit entry'. Πραγματικότητα:
boolean μπορεί να γίνει true από pre-hook era ή backfill — χωρίς
αντίστοιχη audit entry.

**Fix (1 commit, app/api/me/[token]/update/route.ts):**
- [x] Smarter guard που queries audit_log για existing real entries
- [x] WHERE action='email_verified' AND actor_label != 'system'
- [x] Backfill entries (system actor) ignored — δεν εμποδίζουν την
  καταγραφή πραγματικής verification

**Behavior matrix:**
| Scenario | Old guard | New guard |
|----------|-----------|-----------|
| First-time verify (no prior) | LOG ✓ | LOG ✓ |
| Re-submit post-real | SKIP ✓ | SKIP ✓ |
| Real verify post-backfill | SKIP (BUG) | LOG ✓ |
| Re-submit post-real+backfill | SKIP ✓ | SKIP ✓ |

**Production smoke-tested (3 scenarios):**
- ΚΑΡΟΥΣΟΥ (backfill scenario): real verify → 2 audit rows ✓
- ΚΑΡΟΥΣΟΥ idempotent re-submit: still 2 rows ✓
- ΧΡΟΝΑΚΗΣ (existing real entries): re-submit → still 2 rows ✓

**Recovery για 5 affected backfilled members:** Η επόμενη φορά που
θα κάνουν submit στο /me/[token], θα γραφτεί proper real verification
entry. Backfill παραμένει ως historical reference.

Trade-off: +1 DB query ανά self-update POST. Mitigated από
low-frequency endpoint.

### feat/audit-log-date-grouping (merged 2026-05-11) — PR #57

UX refactor του /audit-log page: από member-grouped σε date-grouped
sections με member sub-grouping εντός.

**Πρόβλημα που λύθηκε:**
- /audit-log group-άρει by member αλφαβητικά
- Member με σημερινή entry έπεφτε στο τέλος όταν last_name ήταν
  στο τέλος του αλφαβήτου
- 5 backfill entries (PR #56) από 09/05 + 1 σημερινή ΧΡΟΝΑΚΗ →
  η πιο 'ζωντανή' entry εμφανιζόταν χαμηλά

**Foundation (1 commit):**
- [x] lib/utils/dateBuckets.ts — Athens-timezone-aware date helpers
  - toAthensDateKey(isoTimestamp) → YYYY-MM-DD σε Athens local
  - formatDateBucketLabel(dateKey) → Σήμερα/Χθες/DD-MM-YYYY
  - sv-SE locale trick για stable ISO date output
  - Pure functions, no side effects, reusable σε future timeline UIs

**Page refactor (1 commit):**
- [x] app/audit-log/page.tsx — date-grouped data structure
  - Rename groupedMembers → dateSections (clearer intent)
  - Outer: date buckets (newest first via lexicographic sort)
  - Inner: members alphabetical με Greek collation (preserved)
  - Entries within member: server order preserved (newest first)
- [x] JSX restructure: νέο <section> wrapper με date header
- [x] Heading hierarchy: h2 για date sections, h3 για member groups
  (a11y proper nesting από page <h1>)
- [x] Spacing: space-y-8 outer, space-y-4 inner (visual breathing)
- [x] Empty state guard updated (dateSections.length === 0)
- [x] Type safety: explicit member guard για non-optional prop signature

**Smoke tested με real production data:**
- 3 date sections render (Σήμερα/Χθες/09-05-2026)
- Search 'ΚΟΥΡΟΥΓ' isolates 09/05 με 2 members alphabetical
- Empty search restores όλες οι sections
- TypeScript clean (npx tsc --noEmit)

**Bug εντοπίστηκε στο smoke test (→ PR #58):**
ΚΑΡΟΥΣΟΥ έκανε real verification σήμερα αλλά δεν καταγράφηκε
λόγω του guard '!member.email_verified' στο PR #56 hook. Affected
οι 5 backfilled members + όποιος verified σε pre-PR #49 era.
Fix με smarter audit query check σε επόμενο PR.

### fix/audit-email-verification (merged 2026-05-11) — PR #56

Discriminated 'email_verified' audit action για visibility του verification 
event που έπεφτε σε empty diff στο generic update audit hook (PR #49).

Original trigger: ΚΑΡΟΥΣΟΥ ΕΥΑΓΓΕΛΙΑ verified χωρίς history entry στο 
modal — discovered στο /members modal smoke test μετά το PR #54 merge.

**Schema (Migration 0023):**
- audit_log.action CHECK constraint expanded: + 'email_verified'
- Discriminated event pattern για future verification types
  (phone_verified, identity_verified, payment_verified, member_approved)
- Backup snapshot: audit_log_backup_20260511

**Types:**
- AuditAction union extended με 'email_verified'
- Auto-propagates σε LogChangeEntry + AuditLog Row/Insert/Update

**Code foundation:**
- New helper: logEmailVerified(args) σε lib/audit/log.ts
  - Wraps logChange με defaults: action, table, changes payload
  - previousValue parameter (boolean | null) normalized internally
  - Fail-soft inherited
- AUDIT_ACTION_LABELS: Record<AuditAction, string> exhaustive
  στο lib/audit/labels.ts (TS-enforced future-proofing)
- getActionLabel helper με ?? action fallback
- MEMBER_FIELD_LABELS extended με 'email_verified' (UI consistency
  μεταξύ action label + field diff display)

**API hook:**
- /api/me/[token]/update integrated με logEmailVerified
- SELECT expanded με email_verified column
- Guard: !member.email_verified (idempotency — re-submissions
  δεν δημιουργούν duplicate entries)
- Co-exists με existing logChange (update entries για field diffs)
- /api/portal/profile/update ΔΕΝ touched (different flow, magic
  link auth tracked via Supabase Auth layer)

**Backfill (5 affected members στο kriton-aigaleo):**
- Retroactive entries για verifications πριν το audit hook
- created_at = email_verification_sent_at (best-effort lower bound)
- actor_label = 'system' (distinguished από real user actions)
- New convention: supabase/scripts/backfill/ directory για data
  fixups διακριτές από schema migrations
- Idempotent (NOT EXISTS guard)

**Production smoke-tested (3 scenarios):**
- Fresh verify, no field changes → 1 email_verified entry only
- Idempotent re-submission → 0 new entries (guard works)
- Combined: phone change + first verification → 2 entries
  (update + email_verified, σωστή timestamp ordering)

**Architectural pattern established:**
- Path 1 (diff-style payload): changes = {field: {from, to}}
- vs Path 2/3 (event-style, sentinel, etc.) — rejected για 
  consistency με existing rendering
- Single source of truth για verification events στη DB
- Future verifications follow same pattern: migration + type +
  helper + hook + label

### feat/greek-search-broader (merged 2026-05-11) — PR #55

Broader application του greekSearch foundation από PR #51.
3 commits, 9 files σε 3 logical groups.

**People search (3 sites):**
- [x] components/AttendeesEditor.tsx — attendee picker (2 filters)
- [x] app/calendar/page.tsx — CoordinatorPicker member search
- [x] app/members/page.tsx — main list filter (multi-field haystack
  με board_position + departments — bonus diacritics support)
  + family search

**Group/party search (2 sites):**
- [x] app/seating/page.tsx — unassigned + assigned group filters
- [x] app/cashier/[eventId]/page.tsx — cashier group search +
  perf fix (lift normalizeGreek έξω από per-row filter)

**Entity search (4 sites):**
- [x] app/events/page.tsx — event_name search
- [x] app/finances/page.tsx — BulkChargeModal member picker
- [x] app/finances/SponsorsPanel.tsx — sponsor search
- [x] app/settings/club/sponsors/page.tsx — sponsor search

Edge cases preserved σε όλα: nullable guards (?? ''), early-return
guards (if (!q)), inline conditional shapes (if (q && ...)),
sort logic με localeCompare αμετάβλητο.

Now works universally:
- 'κλεισ' → ΚΛΕΙΣΑΡΧΑΚΗΣ (final-sigma)
- 'γιωργος' → Γιώργος (diacritics)
- 'προεδρος' → Πρόεδρος ΔΣ (board_position bonus)
- 'χορος' → Χορός Πρωτοχρονιάς (event diacritics)

### feat/audit-log-page (merged 2026-05-10) — PR #51

Phase 3 part 1: standalone /audit-log page για cross-member 
audit visibility. 6 commits — foundation work + page basic 
structure χωρίς advanced filters.

**Permission infrastructure (3 commits):**
- [x] Migration 0022: audit module permission
  - CHECK constraint expansion: 8 → 9 modules
  - Auto-grant για Πρόεδρο ΔΣ + Γραμματέα ανά club
  - Snapshot table member_role_permissions_backup_20260510
- [x] types.ts + useRole.ts sync (4 sites: PermissionModule 
  union, Permission union, ALL_PERMISSIONS array, 
  MODULE_TO_PERMISSION record)
- [x] PermissionMatrix UI: 'Ιστορικό αλλαγών' label

**Foundation (1 commit):**
- [x] lib/utils/greekSearch.ts — normalizeGreek() helper
  - Final-sigma normalization (ς → σ)
  - Diacritics stripping (NFD + \p{M}/gu Mark category)
  - Reusable σε όλα τα search inputs του project

**Page (2 commits):**
- [x] app/audit-log/page.tsx (304 lines)
  - Permission gate: audit module
  - Default 15-day window, max 100 entries
  - Two-query member resolution (audit_log + members)
  - Member-grouped display, alphabetical by last_name 
    με Greek collation
  - Greek-aware name search με normalizeGreek
  - 5 status states: loading/error/empty/ready/denied
- [x] AppShell sidebar nav entry
  - Position: monitoring zone (μετά divider, πάνω από Settings)
  - Permission-gated με audit module

**Strategic decisions:**
- **Audit είναι standalone monitoring domain**, όχι member 
  feature → future audit features (πληρωμές, system events, 
  permission changes) μπαίνουν στην ίδια ζώνη του sidebar
- **Two-query resolution αντί FK join** — generic audit_log 
  schema (record_id είναι uuid pointer χωρίς FK), supports 
  any table_name μελλοντικά
- **Card duplication (Option Y)** από MemberHistoryTab — 
  refactor σε shared component μόνο αν εμφανιστούν 3+ usage 
  sites

Production-verified browser smoke test: 5/5 tests passed.

### feat/audit-log-history-tab (merged 2026-05-10) — PR #50

Phase 2 part 2: visibility loop κλείνει — audit data γράφονται 
(PR #49) και τώρα εμφανίζονται στο /members modal.

- [x] lib/audit/labels.ts (58 lines)
  - MEMBER_FIELD_LABELS με 13 entries (9 self-update + 4 admin)
  - ACTOR_LABELS με 4 actor types (Γραμματεία/Από email link/
    Από portal/Σύστημα)
  - Helper functions με fallback στο raw value
- [x] app/members/MemberHistoryTab.tsx (146 lines)
  - Direct client-side Supabase fetch (όχι API route)
  - 4 status states: loading/error/empty/ready
  - Limit 20 entries, newest first
  - Combo timestamps: relative + absolute on hover
  - FIELD_ORDER sorting για consistent UX
  - Empty value display ως '(κενό)'
- [x] /members modal integration:
  - Hoist MemberTab type σε file scope (DRY refactor)
  - 5η tab button 'Ιστορικό' (hidden σε create mode)
  - MemberTabBtn props refactor

Pioneers extraction pattern για member modal tab content — 
future PRs μπορούν να ακολουθήσουν.

### feat/audit-log-foundation (merged 2026-05-10) — PR #49

Phase 2 part 1: foundation για audit logging σε member 
self-updates. Απαντά στο visibility gap που εντοπίστηκε μετά 
το bulk verification send (8 emails ΕΚΑ).

**Schema (Migration 0021):**
- [x] audit_log table — 11 columns με 2 CHECK constraints + 3 FKs
  - id, club_id, table_name, record_id, action, actor_label, 
    actor_user_id, actor_member_id, changes (jsonb), notes, 
    created_at
  - 2 indexes: per-club timeline + per-record history
  - RLS off (consistent με project pattern)

**Types (hand-crafted):**
- [x] AuditAction + AuditActorLabel + AuditLogChanges types
- [x] AuditLog Row/Insert/Update + Database entry με Relationships

**Foundation (lib/audit/log.ts):**
- [x] computeChanges<T>(before, after, fields) → diff utility
- [x] logChange(entry) → fail-soft async writer
- [x] Empty diff = no-op (αποφεύγει spurious entries)

**API hooks:**
- [x] /api/me/[token]/update integration
  - actor_label='self_via_token', actor_user_id=null
- [x] /api/portal/profile/update integration
  - actor_label='self_via_portal', actor_user_id=auth user id

**Architectural decisions:**
- **Generic audit_log table** (όχι member-specific) — μελλοντικά 
  events/finances/sponsors θα reuse το ίδιο schema
- **Application-layer hooks** (όχι DB triggers) — semantic actor 
  identification possible
- **Fail-soft pattern** — audit failure δεν μπλοκάρει user save
- **Pre-computed diff pattern** — caller controls scope μέσω 
  ALLOWED_FIELDS array

Production-verified: 2 real audit entries γράφτηκαν 
(self_via_portal για ΧΡΟΝΑΚΗ + self_via_token για ΑΚΟΥΜΙΑΝΑΚΗ).

### feat/self-update-whitelist-expansion (merged 2026-05-10) — PR #48

6 commits, επέκταση του self-update whitelist από 7 σε 9 
fields (birthplace + residence). Foundation για online αίτηση 
που θα έρθει σε επόμενες sessions.

**Backend (3 commits):**
- [x] GET /api/me/[token] returns birthplace + residence
- [x] POST /api/me/[token]/update accepts birthplace + residence
- [x] POST /api/portal/profile/update accepts birthplace + residence

**Frontend (3 commits):**
- [x] /me/[token] form: type + state + prefill + submit + 
  2 input fields + address label clarity
- [x] /portal/profile: pass 2 νέα fields στο initialData prop
- [x] ProfileEditForm: FormData type + 2 νέα <label> blocks

**UX details:**
- **Address label rename**: 'Διεύθυνση' → 'Διεύθυνση 
  (οδός, αριθμός)' ώστε να μη μπερδεύεται με νέο 'Τόπος κατοικίας'
- Layout στο portal: τα 2 νέα fields half-width, address 
  παραμένει full-width
- Διατήρηση υπάρχουσας σειράς (section grouping σε future PR)

**Strategic context:** Στην έντυπη αίτηση μέλους 
(AITHSH_MELOUS) τα 2 fields είναι core identity data. 
Σύλλογοι Κρητών — birthplace είναι ΣΗΜΑΝΤΙΚΟ (πατρίδα), 
αξίζει να το διαχειρίζονται οι ίδιοι.

### feat/members-row-redesign (merged 2026-05-09) — PR #46

5-commit redesign του /members admin page βάσει beta feedback.

- [x] Νέα στήλη "Ιδιότητα" (occupation) με sortable header,
      Greek collation, nulls last
- [x] Row clickable → ανοίγει Edit modal (hover state +
      stopPropagation σε όλα τα interactive elements)
- [x] Αφαίρεση στήλης "Ενέργειες" (actions πια ζουν στο modal)
- [x] Διαγραφή button μέσα στο modal header (πάνω δεξιά,
      conditional: editing && canEditMembers, closeModal()
      μετά από επιτυχία)
- [x] VerificationStatusBar inline component στο modal με
      5 states ("Email:" prefix για future-proofing με
      SMS/push notifications)

Architectural decision: όλες οι ενέργειες του member ζουν
μαζί στο structured modal context αντί scattered στον πίνακα.

### fix/members-page-shell-loss (merged 2026-05-09) — PR #45

Hotfix για self-inflicted regression από PR #44. Το
pathname.startsWith('/me') στο AppShell guard έπιανε
false positive για /members (το /me είναι strict prefix
του /members).

Fix: defensive strict prefix matching για όλα τα 4
skip-shell paths. Lesson: regression tests σε admin routes
όταν αλλάζουμε AppShell guards.

### feat/member-portal-auth (merged 2026-05-09) — PR #44

Member Portal Chunk 2 — magic link auth + /portal/profile.
8 commits, Migration 0020 (members.user_id), foundation
για Chunks 3-4.

Architectural decisions:
- Magic link only (no passwords) μέσω Supabase admin.generateLink
- hashed_token + verifyOtp pattern (PKCE incompatible με admin-
  generated links)
- Server-side email validation ('Δεν είστε μέλος' αν δεν υπάρχει)
- Lazy auth user creation (no preemptive creation)
- /portal/* prefix για member-facing routes
- Branded magic link email (διαφορετικό από verification)

Routes:
- /portal/login — magic link request form
- /portal/auth-callback — server-side verifyOtp + linkage
- /portal/profile — read-only identity + 7-field self-update
- /api/portal/auth/send-magic-link — email validation + admin
  generateLink + Resend
- /api/portal/profile/update — session-authed self-update

Production-tested end-to-end:
- Magic link sent → click → verifyOtp → linkAuthUserToMember
  → /portal/profile
- members.user_id linked με auth.users.id
- Self-update writes σε DB
- Logout clears session
- Proxy guard μπλοκάρει /portal/profile για unauth users

Connected με: PR #39 (verification), PR #42 (lazy Resend),
types.ts hand-crafted Member type.

### feat/members-sort-by-department (merged 2026-05-09) — PR #43

Επέκταση του sort feature από PR #41 με 5η sortable column
(Τμήματα). Comparator εκμεταλλεύεται pre-sorted departments
από loadMembers (O(1) per comparison).

### fix/resend-lazy-validation (merged 2026-05-09) — PR #42

Lazy initialization στο lib/email/resend.ts. Module-level throw
έσπαζε Next.js build στη φάση 'Collecting page data' όταν τα
RESEND_* env vars δεν ήταν available στο build environment.
Production behavior αμετάβλητο.

### feat/members-list-improvements (merged 2026-05-09) — PR #41

5-commit PR με 4 distinct UX issues στο /members page,
χωρίς schema changes:

- [x] Layout overflow fix (max-w-7xl, email truncation,
      whitespace-nowrap σε actions column)
- [x] Dynamic verification button per state (lib/utils/
      verificationState.ts με 5 states + formatRelativeDate
      Greek locale)
- [x] Sortable column headers (Ονοματεπώνυμο, Ηλικία,
      Email, Κατάσταση)
- [x] Brand-styled table header (μπορντό text + light tint
      background)
- [x] Bulk send result modal (replace window.confirm με
      2-phase modal)

### feat/email-verification (merged 2026-05-08) — PR #39

Email verification & member self-update flow με Resend.
End-to-end production-tested.

**Infrastructure setup:**
- [x] Resend account + domain `hub.party4u.gr` verified (DKIM/SPF/MX/DMARC)
- [x] API key generated, env vars στο Vercel + .env.local
- [x] Logo URL synced στο clubs.branding + club_settings

**Schema (Migration 0019):**
- [x] members.email_verification_token (text, nullable)
- [x] members.email_verification_sent_at (timestamptz)
- [x] members.email_verification_expires_at (timestamptz)
- [x] Partial index για token lookups (μόνο όπου token != NULL)

**Code (8 commits):**
- [x] types.ts: 3 νέα verification fields στο Member type
- [x] lib/email/resend.ts: singleton Resend client με env validation
- [x] lib/email/templates/memberVerification.ts: branded HTML με
  logo + μπορντό CTA button + plain text fallback
- [x] POST /api/members/[id]/send-verification-email (auth)
- [x] POST /api/members/send-verification-bulk (auth)
- [x] GET /api/me/[token] (public, no auth — token IS credential)
- [x] POST /api/me/[token]/update (public, field whitelist)
- [x] /me/[token] public page με branded form

**Architectural decisions:**
- Self-update field whitelist: phone, birth_date, address,
  occupation, parents, maiden_name (όχι first_name/last_name/email)
- Token = UUID v4, 30-day expiry, **reusable μέχρι expiry**
  (μέλος μπορεί να ξανανοίξει form να αλλάξει στοιχεία)
- Implicit verification: αν φτάσει στο email + submit, verified
- Branding διαβάζεται από `club_settings` table (όχι clubs.branding)

**Production verification:**
- info@party4u.gr → email στάλθηκε (Resend Status 200)
- Public page φόρτωσε με σωστό branding (logo + #800000)
- Submit ενημέρωσε DB (email_verified=true, fields populated)
- Bulk send button έτοιμο (untested στα 8 emails — manual run)

**Foundation για:**
- Member Portal Chunks 2-4 (login, profile, events, finances)
- Token mechanism reusable για first-time invite

### feat/club-modules (merged 2026-05-08) — PR #36

Per-club feature flags για modules — Modular features ανά σύλλογο.
Foundation για multi-tenant SaaS με differentiated module access.

**Schema (migration 0017):**
- [x] club_modules table (club_id, module, enabled) με CASCADE + RLS off
- [x] CHECK constraint: 7 modules (members, events, seating, finances, cashier, calendar, communications)
- [x] Seed: όλα enabled για existing clubs

**Code:**
- [x] types.ts: ClubModule + Row/Insert/Update + Database entry (hand-crafted, όχι gen types)
- [x] CORE_CLUB_MODULES (members/events/calendar) — πάντα ενεργά
- [x] CLUB_MODULE_LABELS για UI
- [x] useClubModules hook με per-clubId cache + refresh event
- [x] AppShell: NavItem.module field, sidebar filter με enabled set
- [x] API: GET + PATCH /api/admin/clubs/[id]/modules με requireSuperAdmin
- [x] ClubModulesPanel: toggle switches στο /admin/clubs/[id]
- [x] Core modules guard (UI + API): 400 αν disable core

**Architecture:**
- Modules = additional gate πάνω από permissions
- Standalone-able principle preserved: σύλλογος με μόνο members/events/calendar = MVP
- Foundation για billing tier differentiation (μελλοντικά)

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
