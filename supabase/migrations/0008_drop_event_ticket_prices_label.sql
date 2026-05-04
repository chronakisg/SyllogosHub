-- ============================================
-- Migration 0008: cleanup event_ticket_prices.label
-- Date: 2026-05-04
-- Description:
--   Following UI rollout (Commits 4+5), all event_ticket_prices
--   rows are guaranteed to have category_id populated. This
--   migration:
--     1. Enforces category_id NOT NULL
--     2. Drops the legacy label column
--
-- Pre-flight check (run BEFORE applying):
--   select count(*) from event_ticket_prices
--   where category_id is null;
--   -- Expected: 0
--   -- If > 0: STOP — investigate which rows lack category_id
--
-- Pre-migration state:
--   - category_id nullable (from 0007)
--   - label NOT NULL (from initial schema)
--
-- Post-migration state:
--   - category_id NOT NULL
--   - label column dropped
--
-- Rollback (if needed):
--   alter table public.event_ticket_prices
--     alter column category_id drop not null,
--     add column label text;
--   -- Note: rollback loses label data permanently
-- ============================================

-- Step 1: Enforce category_id NOT NULL
alter table public.event_ticket_prices
  alter column category_id set not null;

-- Step 2: Drop legacy label column
alter table public.event_ticket_prices
  drop column label;

-- ============================================
-- Verification queries (run after migration)
-- ============================================
-- 1. category_id is now NOT NULL
-- select column_name, is_nullable
-- from information_schema.columns
-- where table_name = 'event_ticket_prices'
--   and column_name = 'category_id';
-- -- Expected: category_id, NO
--
-- 2. label column is gone
-- select column_name
-- from information_schema.columns
-- where table_name = 'event_ticket_prices'
--   and column_name = 'label';
-- -- Expected: 0 rows
--
-- 3. Full schema
-- \d event_ticket_prices
-- ============================================
