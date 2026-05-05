-- ============================================
-- Migration 0011: event_expenses category refactor
-- Date: 2026-05-05
-- Description:
--   Replace hardcoded category text enum με FK σε
--   expense_categories catalog (από 0010).
--
--   3 steps σε ένα migration:
--     1. Add category_id uuid (nullable) FK
--     2. (No-op backfill — test mode, count=0)
--     3. Drop category text column, make category_id NOT NULL
--
-- Pre-migration state:
--   - event_expenses.category text NOT NULL (CHECK enum)
--   - event_expenses.category_id NOT EXISTS
--   - event_expenses count: 0 (verified)
--
-- Post-migration state:
--   - event_expenses.category dropped
--   - event_expenses.category_id uuid NOT NULL FK
--     references expense_categories(id)
--   - Index on category_id for FK lookup performance
--
-- Pre-flight check (run BEFORE applying):
--   select count(*) from event_expenses where category_id is null;
--   -- expected: 0 (table empty in test mode)
--
-- Rollback:
--   alter table public.event_expenses
--     add column category text;
--   alter table public.event_expenses
--     drop column category_id;
--   -- Note: rollback loses any category_id mappings
-- ============================================

-- Step 1: Add category_id (nullable initially για clean migration)
alter table public.event_expenses
  add column category_id uuid
  references public.expense_categories(id);

create index if not exists event_expenses_category_id_idx
  on public.event_expenses(category_id);

-- Step 2: Backfill — no-op σε test mode (count=0)
-- Σε production με data, εδώ θα έμπαινε mapping logic:
-- update event_expenses ee
-- set category_id = (
--   select id from expense_categories ec
--   where ec.club_id = ee.club_id
--   and lower(ec.name) like '%' || ee.category || '%'
--   limit 1
-- );

-- Step 3: Make category_id NOT NULL + drop legacy column
alter table public.event_expenses
  alter column category_id set not null;

alter table public.event_expenses
  drop column category;

-- Note: drops constraint event_expenses_category_check automatically
-- with the column drop.

-- ============================================
-- Verification queries (run after migration)
-- ============================================

-- 1. Schema check
-- select column_name, data_type, is_nullable
-- from information_schema.columns
-- where table_name = 'event_expenses'
-- order by ordinal_position;
-- -- Expected: id, club_id, event_id, category_id (NO),
-- --   amount, vendor_name, description, paid_at,
-- --   payment_method, notes, created_at, updated_at
-- -- NOT expected: category

-- 2. category_id FK constraint
-- select tc.constraint_name, kcu.column_name,
--        ccu.table_name as foreign_table
-- from information_schema.table_constraints tc
-- join information_schema.key_column_usage kcu
--   on tc.constraint_name = kcu.constraint_name
-- join information_schema.constraint_column_usage ccu
--   on tc.constraint_name = ccu.constraint_name
-- where tc.table_name = 'event_expenses'
--   and kcu.column_name = 'category_id';
-- -- Expected: event_expenses_category_id_fkey →
-- --   expense_categories

-- 3. Index check
-- select indexname, indexdef
-- from pg_indexes
-- where tablename = 'event_expenses'
--   and indexname like '%category%';

-- 4. category column gone
-- select column_name from information_schema.columns
-- where table_name = 'event_expenses'
--   and column_name = 'category';
-- -- Expected: 0 rows
