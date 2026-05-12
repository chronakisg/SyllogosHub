-- 0024_audit_log_payment_actions.sql
--
-- Επεκτείνει το audit_log.action CHECK constraint για να υποστηρίξει
-- discriminated audit actions για payment lifecycle events:
--   - 'payment.approved': πληρωμή εγκρίθηκε από admin
--   - 'payment.rejected': πληρωμή απορρίφθηκε από admin (με reason)
--
-- Mirrors discriminated action pattern από migration 0023
-- ('email_verified'). Foundation για Phase B.1b (approval RPC endpoints).
--
-- Connects με:
--   - PR #56: discriminated audit action pattern (email_verified)
--   - PR #60: cross-table audit foundation (events PATCH)
--   - PR #61: PAYMENTS_AUDIT_PLAN.md (5 locked decisions)
--
-- Naming convention: <entity>.<event> (namespace prefix για clarity)

-- 1. Snapshot defensive — table είναι μικρό, fast clone
create table if not exists public.audit_log_backup_20260512_pre_payments as
  select * from public.audit_log;

-- 2. Drop old constraint
alter table public.audit_log
  drop constraint audit_log_action_check;

-- 3. Add expanded constraint με 2 νέες discriminated actions
alter table public.audit_log
  add constraint audit_log_action_check
  check (action in (
    'create', 'update', 'delete',
    'email_verified',
    'payment.approved', 'payment.rejected'
  ));

-- 4. RLS state παραμένει αμετάβλητο (disabled — project pattern)

-- Verification queries (παρατίθενται για reference, run στο SQL Editor):
--
-- a. Constraint definition includes new actions:
--    select conname, pg_get_constraintdef(oid)
--    from pg_constraint
--    where conrelid = 'public.audit_log'::regclass
--      and conname = 'audit_log_action_check';
--    Expected: includes 'payment.approved', 'payment.rejected'
--
-- b. Existing data unchanged:
--    select action, count(*) from public.audit_log
--    group by action order by count desc;
--    Expected: 'update' και 'email_verified' rows present, no new rows
--
-- c. Backup snapshot count matches pre-migration audit_log count
