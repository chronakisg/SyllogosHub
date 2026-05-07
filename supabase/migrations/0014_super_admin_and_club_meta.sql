-- ============================================================
-- Migration 0014 — Super admin table + club meta fields
-- ============================================================
--
-- Context: Phase 1 του Super Admin Panel. Εισαγωγή role-gating
-- για cross-club admin operations (lifecycle των clubs, plan
-- management, activation toggles).
--
-- Architectural notes:
--
--   1. `super_admins` είναι ΞΕΧΩΡΙΣΤΟΣ πίνακας (όχι column σε
--      κάποιο `profiles` table) γιατί δεν υπάρχει profiles
--      table στο project. Auth identity ζει στο `auth.users`,
--      και per-club membership/role στο `member_role_permissions`.
--      Ένας dedicated `super_admins(user_id)` table είναι το
--      πιο καθαρό fit: trivial membership check (`EXISTS` query),
--      καμία αλλαγή σε υπάρχοντα schema, FK cascade σε auth.users
--      καλύπτει cleanup όταν deletes χρήστης.
--
--   2. `clubs.plan` και `clubs.is_active` είναι platform-level
--      meta που δεν αφορούν τον ίδιο τον σύλλογο αλλά τη σχέση
--      του με την πλατφόρμα (subscription tier, suspension state).
--      Default 'pro' και true ώστε να μην σπάσουν τα existing
--      clubs μετά τη migration.
--
--   3. RLS παραμένει disabled consistent με τα υπόλοιπα tables
--      του project (βλέπε 0013, 0004 patterns).
--
-- Bootstrap (manual, ΜΕΤΑ τη migration μέσω Supabase SQL editor):
--
--   -- Precondition: ο χρήστης πρέπει να υπάρχει ήδη στο auth.users.
--   -- Αν δεν έχει κάνει sign-up, δημιούργησέ τον πρώτα από
--   -- Supabase Dashboard → Authentication → Users. Αλλιώς το
--   -- INSERT θα κάνει no-op σιωπηλά (0 rows από το SELECT).
--
--   INSERT INTO public.super_admins (user_id)
--   SELECT id FROM auth.users WHERE email = '<bootstrap-email>'
--   ON CONFLICT DO NOTHING;
--
-- ============================================================

-- 1. super_admins table
CREATE TABLE IF NOT EXISTS public.super_admins (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

-- 2. RLS disable (idempotent — consistent με υπόλοιπα tables)
ALTER TABLE public.super_admins DISABLE ROW LEVEL SECURITY;

-- 3. clubs meta columns (idempotent ADD COLUMN IF NOT EXISTS)
-- Λόγος για platform-level fields εδώ:
--   - plan: subscription tier (basic / pro / premium)
--   - is_active: soft-suspend flag (πχ unpaid subscription)
ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS plan text DEFAULT 'pro'
    CHECK (plan IN ('basic','pro','premium')),
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- ============================================================
-- Verification queries (manual run μετά τη migration)
-- ============================================================
--
-- -- 1. Επιβεβαίωση super_admins table
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name = 'super_admins'
-- ORDER BY ordinal_position;
--
-- -- 2. Επιβεβαίωση FK cascade σε auth.users
-- SELECT conname, pg_get_constraintdef(oid) AS definition
-- FROM pg_constraint
-- WHERE conrelid = 'public.super_admins'::regclass
--   AND contype = 'f';
--
-- -- 3. Επιβεβαίωση RLS disabled
-- SELECT relname, relrowsecurity
-- FROM pg_class
-- WHERE relname = 'super_admins'
--   AND relnamespace = 'public'::regnamespace;
-- -- Expected: relrowsecurity = false
--
-- -- 4. Επιβεβαίωση clubs.plan + clubs.is_active
-- SELECT column_name, data_type, column_default, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name = 'clubs'
--   AND column_name IN ('plan', 'is_active')
-- ORDER BY column_name;
--
-- -- 5. Επιβεβαίωση CHECK constraint σε clubs.plan
-- SELECT conname, pg_get_constraintdef(oid) AS definition
-- FROM pg_constraint
-- WHERE conrelid = 'public.clubs'::regclass
--   AND contype = 'c'
--   AND pg_get_constraintdef(oid) LIKE '%plan%';
--
-- -- 6. Επιβεβαίωση ότι existing clubs πήραν defaults
-- SELECT count(*) AS total_clubs,
--        count(plan) AS rows_with_plan,
--        count(is_active) AS rows_with_is_active,
--        sum(CASE WHEN plan = 'pro' THEN 1 ELSE 0 END) AS pro_count,
--        sum(CASE WHEN is_active THEN 1 ELSE 0 END) AS active_count
-- FROM public.clubs;
-- -- Expected: total_clubs = X, all 4 counts = X, pro_count = X, active_count = X
--
-- -- 7. Bootstrap super admin (email-based, idempotent)
-- --    Αντικατέστησε το <bootstrap-email>. Αν ο χρήστης δεν
-- --    υπάρχει στο auth.users, το INSERT γίνεται no-op σιωπηλά.
-- -- INSERT INTO public.super_admins (user_id)
-- -- SELECT id FROM auth.users WHERE email = '<bootstrap-email>'
-- -- ON CONFLICT DO NOTHING;
--
-- -- 8. Επαλήθευση bootstrap (πρέπει να γυρίσει ≥1 row)
-- -- SELECT sa.user_id, au.email, sa.created_at
-- -- FROM public.super_admins sa
-- -- JOIN auth.users au ON au.id = sa.user_id;
--
-- ============================================================
