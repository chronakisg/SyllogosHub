-- ============================================
-- Migration 0012: event_sponsors received state
-- Date: 2026-05-05
-- Description:
--   Add received_at timestamptz nullable column σε
--   event_sponsors. Mirror του event_expenses.paid_at
--   pattern για consistency.
--
--   null → δεσμευμένο (promised)
--   set  → εισπραγμένο/παραληφθέν (received)
--
--   Dashboard θα μετρήσει money sponsors ως revenue
--   ΜΟΝΟ όταν received_at != null.
--
-- Pre-migration state:
--   - event_sponsors χωρίς received_at column
--   - 2 rows υπάρχουν (1 money, 1 product)
--
-- Post-migration state:
--   - received_at nullable column added
--   - Όλα τα existing rows: received_at = null (promised)
--   - Index σε received_at για filter queries
--
-- Backfill strategy:
--   No-op. Όλα τα existing sponsors theoretically
--   could be retroactively marked received αν ο user
--   ξέρει ότι έχουν εισπραχθεί. Manual UI action.
--
-- Rollback:
--   alter table public.event_sponsors
--   drop column received_at;
-- ============================================

alter table public.event_sponsors
  add column received_at timestamptz;

create index if not exists event_sponsors_received_at_idx
  on public.event_sponsors(received_at);

comment on column public.event_sponsors.received_at is
  'Timestamp όταν χορηγία εισπράχθηκε/παραλήφθηκε. null = δεσμευμένη.';

-- ============================================
-- Verification queries
-- ============================================
--
-- 1. Column exists
-- select column_name, data_type, is_nullable
-- from information_schema.columns
-- where table_name = 'event_sponsors'
-- and column_name = 'received_at';
--
-- 2. All existing rows are null (promised)
-- select count(*) as total,
--   count(received_at) as received_count
-- from event_sponsors;
--
-- 3. Index exists
-- select indexname from pg_indexes
-- where tablename = 'event_sponsors'
-- and indexname like '%received%';
