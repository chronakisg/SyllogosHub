-- Migration: 0022_add_audit_module_permission.sql
-- Purpose: Προσθήκη 'audit' module στο permission system
-- Auto-grant για Πρόεδρος ΔΣ + Γραμματέας ανά club
--
-- Foundation για το /audit-log standalone page (cross-member
-- visibility tool). Permission είναι granular και configurable
-- per role μέσω /settings/users.
--
-- Default assignments:
-- - Πρόεδρος ΔΣ: GRANTED (audit + read + all)
-- - Γραμματέας: GRANTED (audit + read + all)
-- - Άλλοι roles: NO ACCESS by default

-- 1. Snapshot (rollback safety net)
create table public.member_role_permissions_backup_20260510 as
  select * from public.member_role_permissions;

-- 2. Drop existing module CHECK constraint
alter table public.member_role_permissions
  drop constraint member_role_permissions_module_check;

-- 3. Recreate με 'audit' added (9 modules)
alter table public.member_role_permissions
  add constraint member_role_permissions_module_check
  check (module in (
    'calendar',
    'members',
    'finances',
    'seating',
    'events',
    'dashboard',
    'settings',
    'cashier',
    'audit'
  ));

-- 4. Auto-grant audit permission για Πρόεδρος + Γραμματέας
insert into public.member_role_permissions (role_id, module, action, scope)
select r.id, 'audit', 'read', 'all'
from public.member_roles r
where r.name in ('Πρόεδρος ΔΣ', 'Γραμματέας');

-- ────────────────────────────────────────────────────────────────────────
-- Verification queries (run μετά):
-- ────────────────────────────────────────────────────────────────────────
-- a) select pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'member_role_permissions_module_check';
--    -- Αναμενόμενο: 9 modules με 'audit' στο τέλος
--
-- b) select r.club_id, r.name, p.module from member_role_permissions p
--    join member_roles r on r.id = p.role_id where p.module = 'audit';
--    -- Αναμενόμενο: 2 rows ανά club (Πρόεδρος + Γραμματέας)
--
-- c) select count(*) from member_role_permissions_backup_20260510;
--    -- Αναμενόμενο: 73 (pre-migration count)

-- ────────────────────────────────────────────────────────────────────────
-- ROLLBACK (αν χρειαστεί):
-- delete from member_role_permissions where module = 'audit';
-- alter table public.member_role_permissions
--   drop constraint member_role_permissions_module_check;
-- alter table public.member_role_permissions
--   add constraint member_role_permissions_module_check
--   check (module in ('calendar', 'members', 'finances', 'seating',
--                     'events', 'dashboard', 'settings', 'cashier'));
-- ────────────────────────────────────────────────────────────────────────
