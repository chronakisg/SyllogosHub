-- Migration: 0028_add_announcements_module.sql
-- Purpose: Προσθήκη 'announcements' module στο permission system
-- Auto-grant για Πρόεδρος ΔΣ + Γραμματέας ανά club (4 actions)
--
-- Foundation για το /announcements admin authoring UI (PR στ').
-- Schema announcements table delivered στο 0027.
--
-- Bonus cleanup: ευθυγραμμίζει το member_permissions_module_check
-- με το member_role_permissions_module_check. Το 0022 πρόσθεσε audit
-- μόνο στο role-level constraint — αυτό το migration προσθέτει και τα 2
-- missing modules (audit + announcements) στο member_permissions_module_check
-- ώστε τα δύο constraints να είναι identical.
--
-- Default assignments:
-- - Πρόεδρος ΔΣ: GRANTED (announcements + read/create/edit/delete + all)
-- - Γραμματέας: GRANTED (announcements + read/create/edit/delete + all)
-- - Άλλοι roles: NO ACCESS by default (admin μπορεί να ενεργοποιήσει manually)

-- 1. Snapshot (rollback safety net)
create table public.member_role_permissions_backup_20260518 as
  select * from public.member_role_permissions;

-- 2a. Drop existing module CHECK constraint (role-level)
alter table public.member_role_permissions
  drop constraint member_role_permissions_module_check;

-- 2b. Recreate με 'announcements' added (10 modules)
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
    'audit',
    'announcements'
  ));

-- 3a. Drop existing module CHECK constraint (per-member level)
-- BONUS CLEANUP: αυτό το constraint ήταν stale από το 0022 (missing audit)
alter table public.member_permissions
  drop constraint member_permissions_module_check;

-- 3b. Recreate με ΚΑΙ audit ΚΑΙ announcements (10 modules — sync με role-level)
alter table public.member_permissions
  add constraint member_permissions_module_check
  check (module in (
    'calendar',
    'members',
    'finances',
    'seating',
    'events',
    'dashboard',
    'settings',
    'cashier',
    'audit',
    'announcements'
  ));

-- 4. Auto-grant announcements permission για Πρόεδρος + Γραμματέας
-- (4 actions × 2 roles × N clubs)
insert into public.member_role_permissions (role_id, module, action, scope)
select r.id, 'announcements', a, 'all'
from public.member_roles r
cross join unnest(array['read', 'create', 'edit', 'delete']) a
where r.name in ('Πρόεδρος ΔΣ', 'Γραμματέας')
on conflict do nothing;

-- ────────────────────────────────────────────────────────────────────────
-- Verification queries (run μετά):
-- ────────────────────────────────────────────────────────────────────────
-- a) select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conname in (
--      'member_role_permissions_module_check',
--      'member_permissions_module_check'
--    );
--    -- Αναμενόμενο: Και τα 2 με 10 modules (identical).
--
-- b) select r.club_id, r.name, p.action from member_role_permissions p
--    join member_roles r on r.id = p.role_id
--    where p.module = 'announcements' order by r.club_id, r.name, p.action;
--    -- Αναμενόμενο: 8 rows ανά club (Πρόεδρος × 4 + Γραμματέας × 4).
--
-- c) select count(*) from member_role_permissions_backup_20260518;
--    -- Αναμενόμενο: 75 (pre-migration count).
--
-- d) select count(*) from member_role_permissions where module = 'announcements';
--    -- Αναμενόμενο: 8 × N clubs (όπου N = clubs με αυτούς τους ρόλους seeded).

-- ────────────────────────────────────────────────────────────────────────
-- ROLLBACK (αν χρειαστεί):
-- delete from member_role_permissions where module = 'announcements';
-- alter table public.member_role_permissions
--   drop constraint member_role_permissions_module_check;
-- alter table public.member_role_permissions
--   add constraint member_role_permissions_module_check
--   check (module in ('calendar', 'members', 'finances', 'seating',
--                     'events', 'dashboard', 'settings', 'cashier', 'audit'));
-- alter table public.member_permissions
--   drop constraint member_permissions_module_check;
-- alter table public.member_permissions
--   add constraint member_permissions_module_check
--   check (module in ('calendar', 'members', 'finances', 'seating',
--                     'events', 'dashboard', 'settings', 'cashier'));
-- -- Σημείωση: ο rollback επιστρέφει στο pre-0028 state, ΔΗΛΑΔΗ
-- -- επανέρχεται και η ασυνέπεια audit (μόνο role-level). Αν θες
-- -- διατήρηση του audit cleanup σε rollback, χρησιμοποίησε το
-- -- snapshot table αντί για manual recreate.
-- ────────────────────────────────────────────────────────────────────────
