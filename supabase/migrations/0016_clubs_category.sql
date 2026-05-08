-- ============================================================
-- Migration 0016 — Clubs category column
-- ============================================================
--
-- Context: Πρόσθεση κατηγορίας ανά σύλλογο για segmentation
-- στο admin panel. Default 'traditional' γιατί ο beta client
-- (Ένωση Κρητών Αιγάλεω) είναι παραδοσιακός σύλλογος και θα
-- συμπεριληφθεί αυτόματα μέσω του default — δεν χρειάζεται
-- manual backfill.
--
-- Architectural notes:
--
--   1. Hardcoded enum αντί για master table: οι 6 κατηγορίες
--      ('traditional', 'sports', 'cultural', 'professional',
--      'friends', 'other') καλύπτουν τα κύρια use cases για
--      Ελληνικούς συλλόγους. Αν μελλοντικά χρειαστεί
--      extensibility (π.χ. user-defined categories ανά
--      πλατφόρμα), refactor σε category_id FK προς νέο
--      club_categories master table — και migration των
--      υπαρχόντων rows σε αντίστοιχα IDs.
--
--   2. Default value 'traditional' εξασφαλίζει ότι existing
--      clubs (μόνο ένας στο prod σήμερα) παίρνουν αυτόματα
--      την σωστή κατηγορία. NEW clubs που δημιουργούνται
--      μέσω /admin panel χωρίς explicit category επίσης
--      παίρνουν 'traditional' — αν χρειαστεί διαφορετική
--      προεπιλογή ή υποχρεωτική επιλογή στο form, αλλάζει
--      σε επόμενη μετανάστευση/UI update.
--
--   3. CHECK constraint προστατεύει από typos σε direct DB
--      writes (π.χ. SQL Editor manual updates) — επιπλέον
--      defensive layer πέρα από τη form-level validation
--      στο /admin/clubs/[id] edit panel.
--
-- Rollback (χειροκίνητα, σπάνια χρήσιμο):
--   ALTER TABLE public.clubs DROP COLUMN IF EXISTS category;
--
-- ============================================================

-- 1. Add category column με default 'traditional' και CHECK
ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS category text
    DEFAULT 'traditional'
    CHECK (category IN (
      'traditional',
      'sports',
      'cultural',
      'professional',
      'friends',
      'other'
    ));

-- ============================================================
-- Verification queries (manual run μετά τη migration)
-- ============================================================
--
-- -- 1. Επιβεβαίωση column με τύπο και default
-- SELECT column_name, data_type, column_default, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name = 'clubs'
--   AND column_name = 'category';
-- -- Expected: data_type='text', column_default='''traditional''::text',
-- --           is_nullable='YES' (column nullable αλλά default καλύπτει)
--
-- -- 2. Επιβεβαίωση CHECK constraint definition
-- SELECT conname, pg_get_constraintdef(oid) AS definition
-- FROM pg_constraint
-- WHERE conrelid = 'public.clubs'::regclass
--   AND contype = 'c'
--   AND pg_get_constraintdef(oid) LIKE '%category%';
-- -- Expected: 1 row με definition που περιέχει
-- --           CHECK ((category = ANY (ARRAY['traditional','sports',...])))
--
-- -- 3. Επιβεβαίωση ότι existing rows πήραν default 'traditional'
-- SELECT id, name, category
-- FROM public.clubs
-- ORDER BY name;
-- -- Expected: όλα τα rows με category='traditional', NO NULLs.
--
-- ============================================================
