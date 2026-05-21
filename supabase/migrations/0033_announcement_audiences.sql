-- Migration 0033: announcement_audiences junction table
-- Supports multi-target audiences (any combination of):
--   global, board, leaders, department.
-- Backfill: existing announcements διατηρούν semantic via department_id
-- + new junction rows. department_id παραμένει for grace period.

-- 1. Junction table
-- Surrogate id PK επειδή PostgreSQL PRIMARY KEY δεν δέχεται expressions
-- (όπως COALESCE) ή nullable columns. NULL-aware uniqueness επιτυγχάνεται
-- μέσω 2 partial unique indexes (βλ. βήμα 2).
CREATE TABLE IF NOT EXISTS public.announcement_audiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  audience_type text NOT NULL CHECK (audience_type IN ('global', 'board', 'leaders', 'department')),
  department_id uuid REFERENCES public.departments(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- department_id is required only when audience_type='department'
  CONSTRAINT audience_dept_consistency CHECK (
    (audience_type = 'department' AND department_id IS NOT NULL) OR
    (audience_type IN ('global', 'board', 'leaders') AND department_id IS NULL)
  )
);

-- 2. NULL-aware uniqueness via partial indexes
-- (global/board/leaders): unique on (announcement_id, audience_type)
CREATE UNIQUE INDEX IF NOT EXISTS idx_announcement_audiences_unique_simple
  ON public.announcement_audiences (announcement_id, audience_type)
  WHERE department_id IS NULL;

-- (department): unique on (announcement_id, department_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_announcement_audiences_unique_dept
  ON public.announcement_audiences (announcement_id, department_id)
  WHERE department_id IS NOT NULL;

-- 3. Read indexes για audience-aware queries (portal feed)
CREATE INDEX IF NOT EXISTS idx_announcement_audiences_announcement
  ON public.announcement_audiences (announcement_id);

CREATE INDEX IF NOT EXISTS idx_announcement_audiences_type_dept
  ON public.announcement_audiences (audience_type, department_id);

-- 4. RLS off (consistent με project convention)
ALTER TABLE public.announcement_audiences DISABLE ROW LEVEL SECURITY;

-- 5. Backfill από existing announcements
-- Snapshot prerequisite (idempotent)
CREATE TABLE IF NOT EXISTS public.announcements_pre_audiences_20260521 AS
  SELECT id, club_id, department_id FROM public.announcements;

-- Backfill: department_id IS NULL → global; ELSE → department με that id
-- Idempotent via NOT EXISTS check (re-runs safe χωρίς ON CONFLICT
-- που χρειάζεται explicit constraint name με partial indexes)
INSERT INTO public.announcement_audiences (announcement_id, audience_type, department_id)
SELECT
  a.id,
  CASE WHEN a.department_id IS NULL THEN 'global' ELSE 'department' END,
  a.department_id
FROM public.announcements a
WHERE NOT EXISTS (
  SELECT 1 FROM public.announcement_audiences aa
  WHERE aa.announcement_id = a.id
);

-- NOTE: announcements.department_id παραμένει για 1-2 sessions
-- ως grace period safety net. Drop σε follow-up PR αφού όλα τα
-- read sites switch στο join table.
