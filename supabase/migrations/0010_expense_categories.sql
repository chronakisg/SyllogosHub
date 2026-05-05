-- ============================================
-- Migration 0010: expense_categories
-- Date: 2026-05-05
-- Description:
--   Per-club catalog για κατηγορίες εξόδων εκδηλώσεων.
--   Mirror του ticket_categories pattern. Source of truth
--   για labels, αντικαθιστά το hardcoded enum που είχε
--   προστεθεί στο 0009 (drops στο 0011).
--
--   Default seed: 8 κατηγορίες ανά club που ταιριάζουν
--   στο use case παραδοσιακών συλλόγων:
--     DJ, Ορχήστρα, Φωτογράφος, Βιντεολήπτης,
--     Ενοίκιο χώρου, Catering, Διακόσμηση, Άλλο
--
-- Pre-migration state:
--   - expense_categories does not exist
--   - event_expenses.category text enum (drops στο 0011)
--
-- Post-migration state:
--   - expense_categories table με 8 seeded rows ανά club
--   - event_expenses ΑΜΕΤΑΒΛΗΤΟ
--
-- Rollback:
--   drop table if exists public.expense_categories cascade;
-- ============================================

create table if not exists public.expense_categories (
  id             uuid          primary key default gen_random_uuid(),
  club_id        uuid          not null references public.clubs(id)
                                 on delete cascade,
  name           text          not null,
  short_label    text,
  default_price  numeric(10,2),
  display_order  smallint      not null default 0,
  is_archived    boolean       not null default false,
  icon           text,
  notes          text,
  created_at     timestamptz   not null default now(),

  constraint expense_categories_club_name_unique
    unique (club_id, name)
);

create index if not exists expense_categories_club_id_idx
  on public.expense_categories(club_id);

create index if not exists expense_categories_club_archived_idx
  on public.expense_categories(club_id, is_archived);

comment on table public.expense_categories is
  'Κατηγορίες εξόδων εκδηλώσεων ανά σύλλογο. is_archived=true
   για soft delete. Replaces hardcoded enum από 0009.';

alter table public.expense_categories disable row level security;

do $$
declare
  c record;
begin
  for c in select id from public.clubs loop
    insert into public.expense_categories
      (club_id, name, short_label, icon, display_order)
    values
      (c.id, 'DJ',             'DJ',       '🎵', 0),
      (c.id, 'Ορχήστρα',      'Ορχ.',     '🎻', 1),
      (c.id, 'Φωτογράφος',    'Φωτ.',     '📸', 2),
      (c.id, 'Βιντεολήπτης',  'Βιντ.',    '🎥', 3),
      (c.id, 'Ενοίκιο χώρου', 'Χώρος',   '🏠', 4),
      (c.id, 'Catering',       'Catering', '🍽️', 5),
      (c.id, 'Διακόσμηση',    'Διακ.',    '🎨', 6),
      (c.id, 'Άλλο',           'Άλλο',    '📋', 7)
    on conflict (club_id, name) do nothing;
  end loop;
end $$;

-- ============================================
-- Verification queries (run after migration)
-- ============================================

-- 1. Table + seed count
-- select count(*) from expense_categories;
-- -- expected: 8 × #clubs

-- 2. Seed contents
-- select club_id, name, short_label, icon, display_order
-- from expense_categories order by club_id, display_order;

-- 3. Indexes
-- select indexname, indexdef from pg_indexes
-- where tablename = 'expense_categories';

-- 4. Constraints
-- select tc.constraint_name, tc.constraint_type, kcu.column_name
-- from information_schema.table_constraints tc
-- join information_schema.key_column_usage kcu
--   on tc.constraint_name = kcu.constraint_name
-- where tc.table_name = 'expense_categories'
-- and tc.constraint_type in ('UNIQUE','FOREIGN KEY','CHECK');
