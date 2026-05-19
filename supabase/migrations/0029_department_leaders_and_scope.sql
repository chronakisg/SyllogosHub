-- Migration 0029: department_leaders + scope_department_id
-- Date: 2026-05-19
--
-- Purpose:
--   1. Add department_leaders table (ομαδάρχης concept foundation)
--   2. Convert scope_value (text, unused in prod) → scope_department_id
--      (uuid FK to departments) σε member_role_permissions + member_permissions
--
-- Safety: zero production scope='department' rows verified before execution.
-- Schema swap was safe — no data migration needed.
--
-- See ROADMAP entry "Department Leaders concept" + PR ζ.1.
----------------------------------------------------------------------

-- ---------- DEFENSIVE SNAPSHOTS ----------

CREATE TABLE IF NOT EXISTS member_role_permissions_backup_20260519_pre_dept_scope AS
  SELECT * FROM member_role_permissions;

CREATE TABLE IF NOT EXISTS member_permissions_backup_20260519_pre_dept_scope AS
  SELECT * FROM member_permissions;

-- ---------- 1. department_leaders table ----------

CREATE TABLE IF NOT EXISTS department_leaders (
  department_id uuid NOT NULL
    REFERENCES departments(id) ON DELETE CASCADE,
  member_id uuid NOT NULL
    REFERENCES members(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'leader'
    CHECK (role IN ('leader', 'assistant')),
  started_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (department_id, member_id)
);

ALTER TABLE department_leaders DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_department_leaders_member
  ON department_leaders(member_id);

-- ---------- 2. member_role_permissions: scope_value → scope_department_id ----------

ALTER TABLE member_role_permissions
  DROP CONSTRAINT IF EXISTS member_role_permissions_unique;

ALTER TABLE member_role_permissions DROP COLUMN IF EXISTS scope_value;

ALTER TABLE member_role_permissions
  ADD COLUMN IF NOT EXISTS scope_department_id uuid
  REFERENCES departments(id) ON DELETE CASCADE;

ALTER TABLE member_role_permissions
  ADD CONSTRAINT member_role_permissions_unique
  UNIQUE (role_id, module, action, scope, scope_department_id);

ALTER TABLE member_role_permissions
  ADD CONSTRAINT member_role_permissions_scope_dept_consistency
  CHECK (
    (scope = 'department' AND scope_department_id IS NOT NULL)
    OR
    (scope IN ('all', 'own') AND scope_department_id IS NULL)
  );

-- ---------- 3. member_permissions: same treatment ----------

ALTER TABLE member_permissions
  DROP CONSTRAINT IF EXISTS member_permissions_member_id_module_action_scope_scope_valu_key;

ALTER TABLE member_permissions DROP COLUMN IF EXISTS scope_value;

ALTER TABLE member_permissions
  ADD COLUMN IF NOT EXISTS scope_department_id uuid
  REFERENCES departments(id) ON DELETE CASCADE;

ALTER TABLE member_permissions
  ADD CONSTRAINT member_permissions_member_module_action_scope_dept_unique
  UNIQUE (member_id, module, action, scope, scope_department_id);

ALTER TABLE member_permissions
  ADD CONSTRAINT member_permissions_scope_dept_consistency
  CHECK (
    (scope = 'department' AND scope_department_id IS NOT NULL)
    OR
    (scope IN ('all', 'own') AND scope_department_id IS NULL)
  );

-- ---------- VERIFICATION QUERIES (appendix, run separately if needed) ----------

-- V1: department_leaders exists, empty
-- Expected: 0
-- SELECT count(*) FROM department_leaders;

-- V2: scope_value gone, scope_department_id present
-- Expected: 2 rows showing scope + scope_department_id, no scope_value
-- SELECT table_name, column_name
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name IN ('member_role_permissions', 'member_permissions')
--   AND column_name LIKE 'scope%'
-- ORDER BY table_name, column_name;

-- V3: Row counts preserved
-- Expected: 83 + 0
-- SELECT 'member_role_permissions' AS tbl, count(*) FROM member_role_permissions
-- UNION ALL
-- SELECT 'member_permissions', count(*) FROM member_permissions;

-- V4: Backups preserved (83 + 0)
-- V5: All existing rows satisfy new CHECK (scope='all', dept_id NULL)
----------------------------------------------------------------------
