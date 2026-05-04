-- ============================================
-- Migration 0007: event_ticket_prices.category_id
-- Date: 2026-05-04
-- Description:
--   Adds nullable FK column category_id linking
--   event_ticket_prices to ticket_categories.
--   NOT NULL constraint comes in migration 0008
--   AFTER UI commits (4+5) are complete and verified.
--
-- Pre-migration state:
--   - ticket_categories exists with seeded defaults (0006)
--   - event_ticket_prices.category_id does NOT exist
--   - event_ticket_prices is empty (test mode, count=0)
--
-- Post-migration state:
--   - event_ticket_prices.category_id exists, nullable
--   - Index on category_id for FK lookup performance
--
-- Rollback:
--   alter table public.event_ticket_prices
--     drop column if exists category_id;
-- ============================================

alter table public.event_ticket_prices
  add column category_id uuid
  references public.ticket_categories(id);

create index if not exists event_ticket_prices_category_idx
  on public.event_ticket_prices(category_id);

comment on column public.event_ticket_prices.category_id is
  'FK προς ticket_categories. Nullable μέχρι το migration 0008
   (μετά UI rollout). Τότε γίνεται NOT NULL και πέφτει το label.';

-- ============================================
-- Verification queries (run after migration)
-- ============================================
-- 1. Column exists + nullable + UUID type
-- select column_name, data_type, is_nullable
-- from information_schema.columns
-- where table_name = 'event_ticket_prices'
--   and column_name = 'category_id';
-- -- Expected: category_id, uuid, YES
--
-- 2. FK constraint exists
-- select tc.constraint_name, kcu.column_name,
--        ccu.table_name as foreign_table
-- from information_schema.table_constraints tc
-- join information_schema.key_column_usage kcu
--   on tc.constraint_name = kcu.constraint_name
-- join information_schema.constraint_column_usage ccu
--   on tc.constraint_name = ccu.constraint_name
-- where tc.table_name = 'event_ticket_prices'
--   and kcu.column_name = 'category_id';
--
-- 3. Index exists
-- select indexname, indexdef
-- from pg_indexes
-- where tablename = 'event_ticket_prices'
--   and indexname = 'event_ticket_prices_category_idx';

-- End of migration 0007
