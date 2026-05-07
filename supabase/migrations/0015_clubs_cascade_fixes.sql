-- ============================================================
-- Migration 0015 — Clubs FK CASCADE fixes (multi-tenancy cleanup)
-- ============================================================
--
-- Context: Όταν ένας super admin διαγράφει σύλλογο μέσω του
-- /admin panel, όλα τα δεδομένα του (members, events, payments,
-- κρατήσεις, settings, user roles) πρέπει να φεύγουν αυτόματα.
-- Τα 6 FKs που είχαν NO ACTION (default PostgreSQL) θα μπλόκαραν
-- το DELETE με opaque error στο prod. Μετατροπή σε CASCADE
-- επιτρέπει clean tenant deletion με ένα μόνο DELETE FROM clubs.
--
-- Audit pre-migration (έτρεξε ο user — βλ. session 2026-05-07):
--   6 FKs με on_delete_action = 'NO ACTION':
--     - club_settings.club_id
--     - events.club_id
--     - members.club_id
--     - payments.club_id
--     - reservation_attendees.club_id
--     - user_roles.club_id
--
-- Architectural notes:
--
--   1. Σειρά CASCADE: Postgres χειρίζεται transitively. Π.χ.
--      DELETE FROM clubs → CASCADE σε members → CASCADE σε
--      member_role_assignments (μέσω member_id) — αρκεί κάθε
--      level να έχει σωστό CASCADE. Αυτή η migration κλείνει
--      το top level (clubs → 6 children).
--
--   2. Idempotency: DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT
--      pattern. Αν τρέξει ξανά, το DROP IF EXISTS αφαιρεί το
--      ήδη υπάρχον CASCADE και το ξαναδημιουργεί ίδιο.
--
--   3. Constraint naming: ακολουθεί το PostgreSQL default
--      `<table>_<column>_fkey` που εμφανίζεται στο audit output
--      ως default όταν δεν έχει δηλωθεί explicit name στο
--      CREATE TABLE. Αν υπάρχει differently named constraint
--      (από out-of-band schema setup), το DROP IF EXISTS θα
--      κάνει silent no-op και θα προστεθεί δεύτερο constraint
--      δίπλα — η verification query στο τέλος θα το πιάσει.
--
-- Rollback (χειροκίνητα, σπάνια χρήσιμο):
--   Αντικατάσταση ON DELETE CASCADE με NO ACTION ανά table.
--
-- ============================================================

-- 1. club_settings.club_id
ALTER TABLE public.club_settings
  DROP CONSTRAINT IF EXISTS club_settings_club_id_fkey;
ALTER TABLE public.club_settings
  ADD CONSTRAINT club_settings_club_id_fkey
  FOREIGN KEY (club_id) REFERENCES public.clubs(id)
  ON DELETE CASCADE;

-- 2. events.club_id
ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_club_id_fkey;
ALTER TABLE public.events
  ADD CONSTRAINT events_club_id_fkey
  FOREIGN KEY (club_id) REFERENCES public.clubs(id)
  ON DELETE CASCADE;

-- 3. members.club_id
ALTER TABLE public.members
  DROP CONSTRAINT IF EXISTS members_club_id_fkey;
ALTER TABLE public.members
  ADD CONSTRAINT members_club_id_fkey
  FOREIGN KEY (club_id) REFERENCES public.clubs(id)
  ON DELETE CASCADE;

-- 4. payments.club_id
ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_club_id_fkey;
ALTER TABLE public.payments
  ADD CONSTRAINT payments_club_id_fkey
  FOREIGN KEY (club_id) REFERENCES public.clubs(id)
  ON DELETE CASCADE;

-- 5. reservation_attendees.club_id
ALTER TABLE public.reservation_attendees
  DROP CONSTRAINT IF EXISTS reservation_attendees_club_id_fkey;
ALTER TABLE public.reservation_attendees
  ADD CONSTRAINT reservation_attendees_club_id_fkey
  FOREIGN KEY (club_id) REFERENCES public.clubs(id)
  ON DELETE CASCADE;

-- 6. user_roles.club_id
ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_club_id_fkey;
ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_club_id_fkey
  FOREIGN KEY (club_id) REFERENCES public.clubs(id)
  ON DELETE CASCADE;

-- ============================================================
-- Verification queries (manual run μετά τη migration)
-- ============================================================
--
-- -- 1. Όλοι οι FKs προς clubs πρέπει τώρα να έχουν CASCADE
-- SELECT
--   cl.relname AS source_table,
--   a.attname  AS source_column,
--   con.conname AS constraint_name,
--   CASE con.confdeltype
--     WHEN 'a' THEN 'NO ACTION'
--     WHEN 'r' THEN 'RESTRICT'
--     WHEN 'c' THEN 'CASCADE'
--     WHEN 'n' THEN 'SET NULL'
--     WHEN 'd' THEN 'SET DEFAULT'
--     ELSE con.confdeltype::text
--   END AS on_delete_action
-- FROM pg_constraint con
-- JOIN pg_class cl     ON cl.oid = con.conrelid
-- JOIN pg_namespace ns ON ns.oid = cl.relnamespace
-- JOIN pg_attribute a  ON a.attrelid = con.conrelid
--                     AND a.attnum = ANY (con.conkey)
-- WHERE con.contype = 'f'
--   AND con.confrelid = 'public.clubs'::regclass
--   AND ns.nspname = 'public'
-- ORDER BY cl.relname, a.attname;
-- -- Expected: όλες οι γραμμές με on_delete_action = 'CASCADE'.
-- -- Αν εμφανιστεί 'NO ACTION' → το constraint name ήταν διαφορετικό
-- -- από τη convention, και η migration άφησε το παλιό FK ζωντανό
-- -- δίπλα στο νέο.
--
-- -- 2. Έλεγχος για duplicate FKs (defensive — αν κάτι πήγε στραβά)
-- SELECT cl.relname AS source_table, COUNT(*) AS fk_count
-- FROM pg_constraint con
-- JOIN pg_class cl ON cl.oid = con.conrelid
-- WHERE con.contype = 'f'
--   AND con.confrelid = 'public.clubs'::regclass
-- GROUP BY cl.relname
-- HAVING COUNT(*) > 1;
-- -- Expected: 0 rows. Αν υπάρχει row → υπάρχουν duplicate FKs
-- -- για το ίδιο column. Σε αυτή την περίπτωση, manual cleanup:
-- -- DROP τα παλιά constraints με τα actual names.
--
-- -- 3. Smoke test (ΠΡΟΣΟΧΗ — destructive, μόνο σε dev/staging):
-- -- BEGIN;
-- --   INSERT INTO public.clubs (slug, name) VALUES ('cascade-test', 'Cascade Test');
-- --   -- Add minimal child rows σε members, events, etc...
-- --   DELETE FROM public.clubs WHERE slug = 'cascade-test';
-- --   -- Επιβεβαίωση ότι children διαγράφηκαν
-- -- ROLLBACK;
--
-- ============================================================
