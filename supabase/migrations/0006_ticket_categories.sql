-- ============================================
-- Migration 0006: Ticket Categories
-- Date: 2026-05-04
-- Description:
--   Adds ticket_categories table for per-club ticket category catalog.
--   Each club defines named categories (e.g., Ενήλικας, Παιδί) with
--   a category_kind enum (adult / child / other), optional default price,
--   display order, and soft-archive flag.
--   Seeds 2 default categories per existing club:
--     - Ενήλικας (kind=adult, display_order=0)
--     - Παιδί    (kind=child, display_order=1)
--
-- Pre-migration state:
--   - event_ticket_prices has label text column (to be replaced in 0007)
--   - ticket_categories does not exist
--
-- Post-migration state:
--   - ticket_categories table exists with 2 rows per club
--   - event_ticket_prices unchanged (label still present)
--
-- Rollback:
--   drop table if exists public.ticket_categories cascade;
-- ============================================

-- ----------------------------------------------------
-- TABLE: ticket_categories
-- ----------------------------------------------------
create table if not exists public.ticket_categories (
  id             uuid         primary key default gen_random_uuid(),
  club_id        uuid         not null references public.clubs(id) on delete cascade,
  name           text         not null,
  short_label    text,
  default_price  numeric(10,2),
  display_order  smallint     not null default 0,
  is_archived    boolean      not null default false,
  category_kind  text         not null default 'other'
    constraint ticket_categories_kind_check
    check (category_kind in ('adult', 'child', 'other')),
  notes          text,
  created_at     timestamptz  not null default now(),

  constraint ticket_categories_club_name_unique
    unique (club_id, name)
);

-- ----------------------------------------------------
-- Indexes
-- ----------------------------------------------------
create index if not exists ticket_categories_club_id_idx
  on public.ticket_categories(club_id);

create index if not exists ticket_categories_club_archived_idx
  on public.ticket_categories(club_id, is_archived);

comment on table public.ticket_categories is
  'Κατηγορίες εισιτηρίων ανά σύλλογο. is_archived=true για soft delete.';

-- ----------------------------------------------------
-- RLS: disabled (consistent με existing pattern)
-- ----------------------------------------------------
alter table public.ticket_categories disable row level security;

-- ============================================
-- SEED: 2 default categories per existing club
-- ============================================
do $$
declare
  c record;
begin
  for c in select id from public.clubs loop
    insert into public.ticket_categories
      (club_id, name, short_label, category_kind, display_order)
    values
      (c.id, 'Ενήλικας', 'Ενήλ.', 'adult', 0),
      (c.id, 'Παιδί',    'Παιδί', 'child', 1)
    on conflict (club_id, name) do nothing;
  end loop;
end $$;

-- ============================================
-- Verification queries (run after migration)
-- ============================================
-- select count(*) from public.ticket_categories;
-- -- Expected: 2 × (number of clubs)
--
-- select club_id, name, short_label, category_kind, display_order, is_archived
-- from public.ticket_categories
-- order by club_id, display_order;
--
-- select indexname, indexdef
-- from pg_indexes
-- where tablename = 'ticket_categories';
--
-- select tc.constraint_name, kcu.column_name
-- from information_schema.table_constraints tc
-- join information_schema.key_column_usage kcu
--   on tc.constraint_name = kcu.constraint_name
-- where tc.table_name = 'ticket_categories'
--   and tc.constraint_type in ('UNIQUE','FOREIGN KEY','CHECK');

-- End of migration 0006
