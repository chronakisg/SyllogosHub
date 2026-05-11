-- Backfill: 0023_email_verified_audit.sql
-- Generated from: Migration 0023 (email_verified action added)
-- Executed: 2026-05-11 (paired με PR #56)
-- Affected: 5 members verified πριν το audit hook (PR #49 + PR #56)
--
-- Purpose: Retroactive audit entries για members με email_verified=true
--          αλλά καμία υπάρχουσα 'email_verified' audit entry — gap
--          που υπήρξε επειδή το audit hook προστέθηκε ΜΕΤΑ από bulk
--          send + verifications.
--
-- Idempotent: NOT EXISTS guard ώστε re-execution να μη δημιουργεί
--             duplicates. Ασφαλές να ξανατρέξει σε άλλο environment.
--
-- created_at strategy: email_verification_sent_at ως best-effort
--                      lower bound (verification σίγουρα έγινε ΜΕΤΑ
--                      το send). Notes εξηγούν την προσέγγιση.

-- Pre-flight: count expected backfill rows
select count(*) as expected_inserts
from members m
where m.email_verified = true
  and not exists (
    select 1 from audit_log al
    where al.record_id = m.id
      and al.action = 'email_verified'
  );

-- 1. Backfill INSERT
insert into audit_log (
  club_id,
  table_name,
  record_id,
  action,
  actor_label,
  changes,
  notes,
  created_at
)
select
  m.club_id,
  'members',
  m.id,
  'email_verified',
  'system',
  '{"email_verified": {"from": false, "to": true}}'::jsonb,
  'Backfill (PR #56): email στάλθηκε στις '
    || to_char(m.email_verification_sent_at at time zone 'Europe/Athens', 'DD/MM/YYYY HH24:MI')
    || ' — actual verification timestamp unknown, approximated as sent_at',
  coalesce(m.email_verification_sent_at, now())
from members m
where m.email_verified = true
  and not exists (
    select 1 from audit_log al
    where al.record_id = m.id
      and al.action = 'email_verified'
  );

-- ────────────────────────────────────────────────────────────────────
-- Verification queries (run μετά την εκτέλεση)
-- ────────────────────────────────────────────────────────────────────

-- a) Post-count should be 0 (no remaining gaps)
-- select count(*) as remaining_gaps
-- from members m
-- where m.email_verified = true
--   and not exists (
--     select 1 from audit_log al
--     where al.record_id = m.id
--       and al.action = 'email_verified'
--   );
-- Αναμενόμενο: 0

-- b) Verify backfilled entries chronologically
-- select
--   al.created_at,
--   m.last_name || ' ' || m.first_name as member,
--   al.action,
--   al.actor_label,
--   al.notes
-- from audit_log al
-- join members m on m.id = al.record_id
-- where al.actor_label = 'system'
--   and al.notes like 'Backfill%'
-- order by al.created_at asc;
-- Αναμενόμενο: 5 rows (production execution count για kriton-aigaleo)
