-- ============================================================
-- Migration 0013 — Cashier payment fields για reservation_attendees
-- ============================================================
--
-- Context: Phase 1 του Cashier Interface (βλέπε docs/CASHIER_PLAN.md).
-- Προσθήκη per-attendee payment tracking ώστε ο ταμίας στην είσοδο
-- εκδήλωσης να κάνει πληρωμή + check-in σε ένα atomic update.
--
-- Architectural note: To `reservation_attendees` table είναι ήδη το
-- foundation για presence/identity. Τα νέα payment fields ζουν εδώ
-- (όχι σε ξεχωριστό payments table) γιατί η UX είναι 1-1 attendee
-- ↔ payment record. Refund/undo flow ΔΕΝ υποστηρίζεται by design.
--
-- Standalone-able principle preserved: το /seating UI δεν αγγίζει
-- αυτά τα fields. Μόνο το Cashier module γράφει σε αυτά. Το
-- /seating sidebar μπορεί να διαβάζει payment status conditionally
-- (permission-gated), βλέπε PR3 (feat/seating-payment-indicator).
--
-- Manual prerequisite (run ΠΡΙΝ από αυτή τη migration):
--
--   CREATE TABLE reservation_attendees_backup_20260506 AS
--   SELECT * FROM reservation_attendees;
--
-- ============================================================

-- 1. Add payment columns
ALTER TABLE public.reservation_attendees
  ADD COLUMN IF NOT EXISTS paid_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS paid_amount numeric(10,2) NULL,
  ADD COLUMN IF NOT EXISTS paid_by_user_id uuid NULL
    REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. CHECK constraint: αν paid_at υπάρχει, paid_amount υποχρεωτικό
-- Λόγος: data integrity — δεν θέλουμε rows που λένε "πληρώθηκε"
-- αλλά δεν ξέρουμε πόσο.
ALTER TABLE public.reservation_attendees
  DROP CONSTRAINT IF EXISTS paid_amount_required_if_paid;

ALTER TABLE public.reservation_attendees
  ADD CONSTRAINT paid_amount_required_if_paid
  CHECK ((paid_at IS NULL) OR (paid_amount IS NOT NULL));

-- 3. Partial index για cashier hot path
-- Ο cashier φιλτράρει συχνά "ποιοι unpaid attendees ανά reservation;"
-- Partial index σε WHERE paid_at IS NULL είναι το ιδανικό για αυτό.
DROP INDEX IF EXISTS idx_attendees_unpaid;

CREATE INDEX idx_attendees_unpaid
  ON public.reservation_attendees(reservation_id)
  WHERE paid_at IS NULL;

-- 4. RLS disable (idempotent — consistent με υπάρχοντα tables)
ALTER TABLE public.reservation_attendees DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- Verification queries (manual run μετά τη migration)
-- ============================================================
--
-- -- 1. Επιβεβαίωση columns
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'reservation_attendees'
--   AND column_name IN ('paid_at', 'paid_amount', 'paid_by_user_id')
-- ORDER BY column_name;
--
-- -- 2. Επιβεβαίωση CHECK constraint
-- SELECT conname, pg_get_constraintdef(oid) AS definition
-- FROM pg_constraint
-- WHERE conrelid = 'public.reservation_attendees'::regclass
--   AND conname = 'paid_amount_required_if_paid';
--
-- -- 3. Επιβεβαίωση partial index
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename = 'reservation_attendees'
--   AND indexname = 'idx_attendees_unpaid';
--
-- -- 4. Επιβεβαίωση ότι existing rows δεν έχουν paid_at (όλα NULL)
-- SELECT count(*) AS total_rows,
--        count(paid_at) AS rows_with_paid_at,
--        count(paid_amount) AS rows_with_paid_amount
-- FROM public.reservation_attendees;
-- -- Expected: total_rows = X, rows_with_paid_at = 0, rows_with_paid_amount = 0
--
-- -- 5. Snapshot table verification (αν έγινε snapshot)
-- SELECT count(*) FROM reservation_attendees_backup_20260506;
-- -- Expected: same count με reservation_attendees
--
-- ============================================================
