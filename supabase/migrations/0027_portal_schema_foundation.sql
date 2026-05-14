-- ============================================================
-- Migration 0027: Member Portal Chunk 3 schema foundation
-- ============================================================
-- Purpose: Add 3 new tables + 1 column για το Member Portal:
--   1. announcements      — club news (global + per-department)
--   2. classes            — μαθήματα (χορός, λύρα, κλπ)
--   3. class_enrollments  — member ↔ class linkage (soft delete)
--   4. members.last_announcement_check_at — read tracking για badge
--
-- Connects με:
--   - Member Portal Chunks 3-4 (ROADMAP entry, post-PR #87)
--   - PR #44 (Member Portal Chunk 2 — auth + profile foundation)
--
-- RLS: Disabled per project convention (consistency με rest of schema).
--      Aggressive RLS rollout = separate 🔴 ROADMAP entry.
--
-- Decisions (per session 2026-05-14):
--   S1 (β): announcements = title/body/department_id/pinned/published
--   S2 (β): read tracking via members.last_announcement_check_at
--   S3 (α): classes = single recurring schedule (day + time)
--   S4 (β): class_enrollments soft delete (unenrolled_at)
--   S5 (α): RLS off
-- ============================================================

-- ─── 1. ANNOUNCEMENTS ────────────────────────────────────────

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  title text not null,
  body text not null,
  pinned boolean not null default false,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.members(id) on delete set null,

  constraint announcements_title_not_empty check (length(trim(title)) > 0),
  constraint announcements_body_not_empty check (length(trim(body)) > 0)
);

create index if not exists idx_announcements_club_id
  on public.announcements (club_id);

create index if not exists idx_announcements_department_id
  on public.announcements (department_id)
  where department_id is not null;

create index if not exists idx_announcements_published_created
  on public.announcements (club_id, published, created_at desc)
  where published = true;

alter table public.announcements disable row level security;

-- ─── 2. CLASSES ──────────────────────────────────────────────

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  name text not null,
  day_of_week smallint check (day_of_week between 1 and 7),
  start_time time,
  end_time time,
  location text,
  instructor text,
  active boolean not null default true,
  created_at timestamptz not null default now(),

  constraint classes_name_not_empty check (length(trim(name)) > 0),
  constraint classes_time_order check (
    start_time is null or end_time is null or start_time < end_time
  )
);

create index if not exists idx_classes_club_id
  on public.classes (club_id);

create index if not exists idx_classes_department_id
  on public.classes (department_id)
  where department_id is not null;

create index if not exists idx_classes_active
  on public.classes (club_id, active)
  where active = true;

alter table public.classes disable row level security;

-- ─── 3. CLASS_ENROLLMENTS ────────────────────────────────────

create table if not exists public.class_enrollments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  enrolled_at timestamptz not null default now(),
  unenrolled_at timestamptz,
  notes text,

  -- Prevent duplicate active enrollments
  constraint class_enrollments_unique_active
    unique nulls not distinct (class_id, member_id, unenrolled_at)
);

create index if not exists idx_class_enrollments_class_id
  on public.class_enrollments (class_id);

create index if not exists idx_class_enrollments_member_id
  on public.class_enrollments (member_id);

create index if not exists idx_class_enrollments_active
  on public.class_enrollments (class_id, member_id)
  where unenrolled_at is null;

alter table public.class_enrollments disable row level security;

-- ─── 4. members.last_announcement_check_at ──────────────────

-- Read tracking για το "νέα" badge στο portal home.
-- User opens /portal/announcements → timestamp updates → badge clears.
alter table public.members
  add column if not exists last_announcement_check_at timestamptz;

-- ============================================================
-- POST-MIGRATION VERIFICATION QUERIES (run manually)
-- ============================================================
-- Query 1: Table existence
--   select tablename from pg_tables
--   where schemaname = 'public'
--     and tablename in ('announcements', 'classes', 'class_enrollments')
--   order by tablename;
--   EXPECTED: 3 rows
--
-- Query 2: Column on members
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_name = 'members'
--     and column_name = 'last_announcement_check_at';
--   EXPECTED: 1 row (timestamptz, YES)
--
-- Query 3: FK constraints
--   select conname, conrelid::regclass as table_name
--   from pg_constraint
--   where conrelid::regclass::text in (
--     'announcements', 'classes', 'class_enrollments'
--   )
--   order by conrelid::regclass::text, conname;
--   EXPECTED: ~7 rows (FKs + CHECK constraints + UNIQUE)
--
-- Query 4: Indexes
--   select indexname from pg_indexes
--   where tablename in ('announcements', 'classes', 'class_enrollments')
--   order by tablename, indexname;
--   EXPECTED: 9 indexes (3 primary + 6 custom)
--
-- Query 5: RLS state
--   select tablename, rowsecurity from pg_tables
--   where schemaname = 'public'
--     and tablename in ('announcements', 'classes', 'class_enrollments');
--   EXPECTED: rowsecurity = false σε όλα
