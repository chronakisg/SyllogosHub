-- Migration 0031: Add phone2 column to members
-- Discovered: 2026-05-21 session
-- Use case: Δευτερεύον τηλέφωνο επικοινωνίας (κινητό + σταθερό, ή 2 κινητά).
-- No verification flags για phone2 — phone (1) παραμένει το verified primary contact.

-- 1. Snapshot table (safety net)
CREATE TABLE IF NOT EXISTS public.members_pre_phone2_20260521 AS
  SELECT id, club_id, first_name, last_name, phone, email
  FROM public.members;

-- 2. Add column
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS phone2 text;

COMMENT ON COLUMN public.members.phone2 IS
  'Δευτερεύον τηλέφωνο επικοινωνίας. Δεν έχει verification flow — primary contact παραμένει το phone.';

-- 3. RLS off (matches existing pattern — see 0019)
ALTER TABLE public.members DISABLE ROW LEVEL SECURITY;
