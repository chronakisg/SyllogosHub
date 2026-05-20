-- Migration 0030: ensure family_id and family_role are both NULL or both NOT NULL
-- Date: 2026-05-20
--
-- Purpose:
--   Prevent silent corruption where a member is in a family group without a role,
--   or has a role without belonging to a family. Belt-and-suspenders DB-level
--   guard complementing client-side validation σε app/members/page.tsx
--   (MemberModal handleFormSubmit + handleSubmit at l.869-872).
--
--   Surfaced by feat/family-role-select-hardening session (PR #?, 2026-05-20).
----------------------------------------------------------------------

-- ---------- AUDIT (run manually BEFORE applying the constraint) ----------

-- SELECT id, last_name, first_name, family_id, family_role
-- FROM public.members
-- WHERE (family_id IS NULL) <> (family_role IS NULL);
--
-- Expected: 0 rows. Αν επιστρέψει >0 rows, clean them up πριν τρέξεις
-- την ALTER TABLE (πχ set family_role=NULL where family_id IS NULL, ή
-- assign a default family_role where family_id IS NOT NULL).

-- ---------- 1. Add constraint NOT VALID (instant, no table scan) ----------

ALTER TABLE public.members
  ADD CONSTRAINT members_family_role_consistency
  CHECK ((family_id IS NULL) = (family_role IS NULL))
  NOT VALID;

-- ---------- 2. Validate the existing rows (background-friendly) ----------

-- Allows the ALTER to commit instantly. Validation runs in the background
-- without blocking writes. Will fail if any pre-existing row violates the
-- constraint — that's why the audit above must be run first.

ALTER TABLE public.members VALIDATE CONSTRAINT members_family_role_consistency;

-- ---------- VERIFICATION QUERIES (appendix) ----------

-- V1: constraint exists and is validated
-- Expected: 1 row with convalidated = true
-- SELECT conname, convalidated
-- FROM pg_constraint
-- WHERE conname = 'members_family_role_consistency';

-- V2: no violating rows
-- Expected: 0
-- SELECT count(*) FROM public.members
-- WHERE (family_id IS NULL) <> (family_role IS NULL);
----------------------------------------------------------------------
