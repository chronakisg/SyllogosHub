-- ============================================
-- Migration 0009: event_expenses table
-- Date: 2026-05-05
-- Description:
--   Adds event_expenses table for Phase 2 of Event Dashboard.
--   Per-event expense tracking με paid_at για διάκριση
--   εκκρεμή vs πληρωμένα.
--
-- Pre-migration state:
--   - event_expenses does not exist
--
-- Post-migration state:
--   - event_expenses table exists, empty (test mode)
--
-- Rollback:
--   drop table if exists public.event_expenses cascade;
-- ============================================

create table if not exists public.event_expenses (
  id             uuid          primary key default gen_random_uuid(),
  club_id        uuid          not null references public.clubs(id)
                                 on delete cascade,
  event_id       uuid          not null references public.events(id)
                                 on delete cascade,
  category       text          not null
                                 constraint event_expenses_category_check
                                 check (category in (
                                   'entertainment',
                                   'photography',
                                   'venue',
                                   'catering',
                                   'decoration',
                                   'transportation',
                                   'utilities',
                                   'other'
                                 )),
  amount         numeric(10,2) not null
                                 constraint event_expenses_amount_positive
                                 check (amount >= 0),
  vendor_name    text,
  description    text,
  paid_at        timestamptz,
  payment_method text,
  notes          text,
  created_at     timestamptz   not null default now(),
  updated_at     timestamptz   not null default now()
);

create index if not exists event_expenses_club_id_idx
  on public.event_expenses(club_id);

create index if not exists event_expenses_event_id_idx
  on public.event_expenses(event_id);

create index if not exists event_expenses_event_paid_idx
  on public.event_expenses(event_id, paid_at);

comment on table public.event_expenses is
  'Έξοδα ανά εκδήλωση. paid_at=null → εκκρεμές, set → πληρωμένο.';

alter table public.event_expenses disable row level security;

-- ============================================
-- Verification queries (run after migration)
-- ============================================

-- 1. Table created
-- select count(*) from event_expenses; -- expect 0

-- 2. Schema check
-- select column_name, data_type, is_nullable
-- from information_schema.columns
-- where table_name = 'event_expenses'
-- order by ordinal_position;

-- 3. Indexes
-- select indexname, indexdef
-- from pg_indexes
-- where tablename = 'event_expenses';

-- 4. Constraints
-- select conname, pg_get_constraintdef(oid)
-- from pg_constraint
-- where conrelid = 'public.event_expenses'::regclass;
