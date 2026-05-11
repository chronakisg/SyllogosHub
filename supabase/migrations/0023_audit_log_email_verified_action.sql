-- Migration: 0023_audit_log_email_verified_action.sql
-- Purpose: Επέκταση του audit_log.action CHECK constraint με 'email_verified'
--          ώστε να επιτρέπεται discrete tracking του email verification event
--          ως ξεχωριστή action (όχι ως part του generic 'update').
--
-- Context: PR #49 audit foundation εγκαθίδρυσε generic update tracking, αλλά
--          το email_verified=true transition έπεφτε σε empty diff όταν τα
--          whitelisted self-update fields δεν άλλαζαν — με αποτέλεσμα silent
--          audit (πχ ΚΑΡΟΥΣΟΥ verified χωρίς history entry).
--
-- Pattern: Distinct discriminated actions ανά domain event. Μελλοντικά:
--          phone_verified, identity_verified, payment_verified, κλπ μπαίνουν
--          ως ξεχωριστές actions με future migrations.
--
-- Snapshot: Όχι αναγκαίο — append-only data, καμία row δεν touch-άρεται.

-- 1. Drop existing constraint
alter table public.audit_log
  drop constraint audit_log_action_check;

-- 2. Add new constraint με 'email_verified' included
alter table public.audit_log
  add constraint audit_log_action_check
  check (action in (
    'insert',
    'update',
    'delete',
    'email_verified'
  ));

-- ────────────────────────────────────────────────────────────────────
-- Verification queries (run μετά την εκτέλεση)
-- ────────────────────────────────────────────────────────────────────

-- a) Constraint definition περιλαμβάνει email_verified
-- select conname, pg_get_constraintdef(c.oid) as definition
-- from pg_constraint c
-- join pg_class t on c.conrelid = t.oid
-- where t.relname = 'audit_log'
--   and c.conname = 'audit_log_action_check';
-- Αναμενόμενο: ARRAY['insert', 'update', 'delete', 'email_verified']

-- b) Existing rows αμετάβλητες
-- select count(*) from audit_log;
-- Αναμενόμενο: ίδιο count με pre-migration

-- c) Νέα action accepted
-- insert into audit_log (
--   club_id, table_name, record_id, action, actor_label, changes, notes
-- ) values (
--   (select club_id from members limit 1),
--   'members',
--   (select id from members limit 1),
--   'email_verified',
--   'system',
--   '{}'::jsonb,
--   'TEST entry — manually delete after'
-- ) returning id;

-- ────────────────────────────────────────────────────────────────────
-- ROLLBACK
-- ────────────────────────────────────────────────────────────────────
-- alter table public.audit_log
--   drop constraint audit_log_action_check;
-- alter table public.audit_log
--   add constraint audit_log_action_check
--   check (action in ('insert', 'update', 'delete'));
