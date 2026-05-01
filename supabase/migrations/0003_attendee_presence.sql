-- 0003_attendee_presence.sql
-- Title:       Add presence tracking to reservation_attendees
-- Date:        2026-05-01
-- Description:
--   Foundation για το Presence Layer (βλ. ROADMAP.md "Vision & Architecture
--   Compass"). Δύο νέα columns:
--     - is_present   boolean (default true)
--     - checked_in_at timestamptz null
--   Default true διατηρεί συνέπεια με την υπάρχουσα συμπεριφορά (όλοι μέσα
--   αρχικά). Το checked_in_at παραμένει null μέχρι να γίνει explicit check-in
--   (π.χ. QR scan ή manual toggle στο entrance list).
--
-- Snapshot:
--   reservation_attendees_backup_20260501 (safety net για το beta).
--   Drop όταν συγχωνευθεί το feature και επιβεβαιωθεί η σταθερότητα.
--
-- Rollback (manual):
--   alter table public.reservation_attendees
--     drop column if exists checked_in_at,
--     drop column if exists is_present;
--   drop index if exists public.reservation_attendees_presence_idx;

-- ============================================================
-- Snapshot (safety net)
-- ============================================================
create table if not exists public.reservation_attendees_backup_20260501 as
  select * from public.reservation_attendees;

-- ============================================================
-- Schema changes
-- ============================================================
alter table public.reservation_attendees
  add column if not exists is_present boolean not null default true,
  add column if not exists checked_in_at timestamptz null;

-- Backfill: όλοι οι υπάρχοντες attendees ως present (consistent με default).
-- Το NOT NULL DEFAULT true τους κάνει ήδη true, αλλά το παρακάτω είναι safe net
-- για περίπτωση που το column υπήρχε από προηγούμενη μερική εκτέλεση.
update public.reservation_attendees
  set is_present = true
  where is_present is null;

-- ============================================================
-- Index για live attendance queries (foundation για dashboard)
-- ============================================================
create index if not exists reservation_attendees_presence_idx
  on public.reservation_attendees (reservation_id, is_present);

-- ============================================================
-- Documentation
-- ============================================================
comment on column public.reservation_attendees.is_present is
  'True αν ο attendee έχει check-in (default true για να δηλώνει expected attendance)';
comment on column public.reservation_attendees.checked_in_at is
  'Timestamp του check-in. Null όταν is_present=true αλλά δεν έχει γίνει explicit check-in (legacy). Foundation για QR scan audit trail.';
