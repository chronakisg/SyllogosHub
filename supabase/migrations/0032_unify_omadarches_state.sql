-- Migration 0032: Unify ομαδάρχης state
-- Source of truth: department_leaders (was schema-only from PR ζ.1, now canonical).
-- Backfill: rows από member_departments WHERE role IN ('leader','assistant').
--
-- Discovered: 2026-05-21 (dual-source ομαδάρχης drift audit).
-- See ROADMAP entry "Τμήματα-Ρόλος tab merge + role system unification" Step 3.

-- 1. Snapshot table (safety net — preserves pre-unify state όλων των member_departments rows)
CREATE TABLE IF NOT EXISTS public.member_departments_pre_unify_20260521 AS
  SELECT id, club_id, member_id, department_id, role
  FROM public.member_departments;

-- 2. Idempotent backfill (ON CONFLICT για re-runs)
INSERT INTO public.department_leaders (department_id, member_id, role, started_at)
SELECT
  department_id,
  member_id,
  role,
  NOW()
FROM public.member_departments
WHERE role IN ('leader', 'assistant')
ON CONFLICT (department_id, member_id) DO NOTHING;

-- 3. RLS unchanged (matches existing pattern from 0029)
ALTER TABLE public.department_leaders DISABLE ROW LEVEL SECURITY;

-- NOTE: member_departments.role column ΔΕΝ διαγράφεται σε αυτό το PR.
-- Παραμένει για 1-2 sessions ως safety net. Drop παρκάρει σε follow-up.
