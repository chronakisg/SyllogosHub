-- ============================================================
-- Migration 0025: members.is_hub_admin (SyllogosHub Recovery marker)
-- ============================================================
-- Purpose: Add boolean flag marking accounts owned by SyllogosHub
--          operations (not by the club itself). Used for:
--          - Audit log distinction (recovery login vs normal admin)
--          - UI filtering (exclude from member counts/reports)
--          - Future: identify recovery accounts cross-club
--
-- Access control NOT affected by this flag. Full access comes
-- from "Πρόεδρος ΔΣ" role assignment (existing pattern).
--
-- Distinct semantic από is_system_admin (που gates cross-club
-- impersonation στο useCurrentClub.ts:114 — load-bearing, αδιατάρακτο).
-- ============================================================

-- 1. Defensive snapshot (data only — schema/FKs/indexes ΔΕΝ αντιγράφονται).
--    Retained as safety net. Drop after production rollout stabilizes
--    (~1 week). Tracked στο ROADMAP "Drop snapshot tables".
create table if not exists public.members_backup_20260514_pre_hub_admin as
  select * from public.members;

-- 2. Add column με safe default. Idempotent.
alter table public.members
  add column if not exists is_hub_admin boolean not null default false;

-- 3. RLS off (paranoid re-assertion — consistent με project pattern).
alter table public.members disable row level security;

-- ============================================================
-- Verification queries — τρέχουν ξεχωριστά στο Supabase SQL Editor
-- ============================================================

-- a. Column added με σωστό type/default/nullability
-- select column_name, data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_name = 'members' and column_name = 'is_hub_admin';
-- EXPECTED: boolean, NO nullable, default 'false'

-- b. Snapshot count == members count
-- select
--   (select count(*) from public.members) as live,
--   (select count(*) from public.members_backup_20260514_pre_hub_admin) as snapshot;
-- EXPECTED: equal counts (244 για kriton-aigaleo)

-- c. All existing rows default false (no surprise data)
-- select is_hub_admin, count(*)
-- from public.members
-- group by is_hub_admin;
-- EXPECTED: false=ALL, no NULLs, no true

-- d. RLS still disabled
-- select relname, relrowsecurity
-- from pg_class
-- where relname = 'members' and relnamespace = 'public'::regnamespace;
-- EXPECTED: relrowsecurity = false

-- e. Sample read με νέο column (proves runtime happy)
-- select id, email, is_hub_admin from public.members limit 3;
-- EXPECTED: 3 rows με is_hub_admin = false
