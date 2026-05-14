-- ============================================================
-- Migration 0026: Drop user_roles dead table
-- ============================================================
-- Purpose: Remove dead table that was orphaned after the
--          role-based permissions refactor (PR feat/role-based-permissions,
--          merged 2026-05-04).
--
-- The user_roles table was the legacy admin marker before
-- member_roles + member_role_assignments + super_admins took over.
-- It contained 1 redundant row (info@party4u.gr admin assignment
-- for kriton-aigaleo, already covered by:
--   - members.is_president = true
--   - "Πρόεδρος ΔΣ" role assignment
--   - super_admins row from PR #75)
--
-- This migration file is DOCUMENTATION ONLY — production drop
-- has already been executed manually via Supabase SQL Editor
-- on 2026-05-14, with snapshot retained as
-- public.user_roles_backup_20260514.
-- ============================================================

-- 1. Defensive snapshot (idempotent — already exists in production)
create table if not exists public.user_roles_backup_20260514 as
  select * from public.user_roles;

-- 2. Drop the dead table
drop table if exists public.user_roles;

-- ============================================================
-- Verification queries (already executed in production)
-- ============================================================

-- a. Confirm table no longer exists
-- select tablename from pg_tables
-- where schemaname = 'public' and tablename = 'user_roles';
-- EXPECTED: 0 rows

-- b. Confirm snapshot preserved
-- select count(*) from public.user_roles_backup_20260514;
-- EXPECTED: 1

-- c. Confirm snapshot data integrity
-- select user_id, role, club_id from public.user_roles_backup_20260514;
-- EXPECTED: cfa2bdc8-1a6d-453b-8ad2-900ad81d60c7 / admin / 8999769c-...
