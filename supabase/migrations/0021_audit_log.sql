-- ────────────────────────────────────────────────────────────────────────
-- Migration: 0021_audit_log.sql
-- Purpose: Generic audit log foundation για member self-updates (Phase 2)
-- Scope: Self-update only (ΟΧΙ admin coverage — future PR)
--
-- Επιτρέπει την καταγραφή κάθε αλλαγής σε records με semantic actor
-- identification (admin / self_via_token / self_via_portal / system).
--
-- Πρώτη χρήση: members table (self-updates from /me/[token] + /portal/profile)
-- Future tables: events, reservations, finances, sponsors, ...
-- ────────────────────────────────────────────────────────────────────────

-- 1. audit_log table

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id) on delete cascade,

  -- What changed
  table_name text not null,
  record_id uuid not null,
  action text not null check (action in ('insert', 'update', 'delete')),

  -- Who changed it
  actor_label text not null
    check (actor_label in ('admin', 'self_via_token', 'self_via_portal', 'system')),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_member_id uuid references members(id) on delete set null,

  -- What exactly changed (only diffs, flat shape: { field: { from, to } })
  changes jsonb not null,

  -- Context (optional)
  notes text,

  created_at timestamptz not null default now()
);

-- 2. Indexes

create index idx_audit_log_club_created
  on public.audit_log (club_id, created_at desc);

create index idx_audit_log_record
  on public.audit_log (table_name, record_id, created_at desc);

-- 3. RLS off (consistent με project pattern)

alter table public.audit_log disable row level security;

-- ────────────────────────────────────────────────────────────────────────
-- ROLLBACK (αν χρειαστεί):
-- drop table public.audit_log;
-- ────────────────────────────────────────────────────────────────────────
