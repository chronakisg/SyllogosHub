-- ============================================
-- Migration 0005: Role-Based Permissions
-- Date: 2026-05-04
-- Description:
--   Adds 3 tables for role-based permission management:
--     - member_roles (θεσμικοί ρόλοι ανά σύλλογο)
--     - member_role_permissions (permissions per role)
--     - member_role_assignments (member ↔ role)
--   Also expands member_permissions.module CHECK constraint to
--   include 'cashier' for the upcoming Cashier Interface.
--   Seeds 6 default roles: Πρόεδρος ΔΣ, Αντιπρόεδρος, Ταμίας,
--   Γραμματέας, Μέλος ΔΣ, Απλό Μέλος.
--   Auto-assigns roles based on board_position; remaining
--   members get 'Απλό Μέλος' as default access.
--
-- Pre-migration state:
--   - member_permissions table existed (created outside migration
--     track) with 0 rows
--   - 6 members in DB, 1 with board_position='Πρόεδρος'
--
-- Post-migration state:
--   - 6 default roles seeded per club (Πρόεδρος ΔΣ, Αντιπρόεδρος,
--     Ταμίας, Γραμματέας, Μέλος ΔΣ, Απλό Μέλος)
--   - Auto-assignment: members with board_position get the
--     corresponding role; rest get 'Απλό Μέλος'
--   - Every member has at least one role
--   - cashier module ready for use in member_permissions and
--     member_role_permissions
--
-- Rollback (manual, in case of need):
--   alter table public.member_permissions drop constraint member_permissions_module_check;
--   alter table public.member_permissions add constraint member_permissions_module_check
--     check (module = any (array['calendar','members','finances','seating','events','dashboard','settings']));
--   drop table if exists public.member_role_assignments cascade;
--   drop table if exists public.member_role_permissions cascade;
--   drop table if exists public.member_roles cascade;
--
-- Snapshot taken pre-migration:
--   create table public.members_predates_roles_20260504 as
--     select * from public.members;
-- ============================================

-- ----------------------------------------------------
-- TABLE 1: member_roles
-- ----------------------------------------------------
create table if not exists public.member_roles (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  name text not null,
  description text,
  is_system boolean not null default false,
  display_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_roles_name_unique unique (club_id, name)
);

create index if not exists member_roles_club_id_idx
  on public.member_roles(club_id);

comment on table public.member_roles is
  'Θεσμικοί ρόλοι ανά σύλλογο. is_system=true για seed defaults.';

-- ----------------------------------------------------
-- TABLE 2: member_role_permissions
-- ----------------------------------------------------
create table if not exists public.member_role_permissions (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.member_roles(id) on delete cascade,
  module text not null,
  action text not null,
  scope text not null default 'all',
  scope_value text,
  created_at timestamptz not null default now(),

  constraint member_role_permissions_module_check
    check (module = any (array[
      'calendar','members','finances','seating',
      'events','dashboard','settings','cashier'
    ])),
  constraint member_role_permissions_action_check
    check (action = any (array['read','create','edit','delete'])),
  constraint member_role_permissions_scope_check
    check (scope = any (array['all','own','department'])),
  constraint member_role_permissions_unique
    unique (role_id, module, action, scope, scope_value)
);

create index if not exists member_role_permissions_role_id_idx
  on public.member_role_permissions(role_id);

comment on table public.member_role_permissions is
  'Permissions per role. Mirrors member_permissions schema.';

-- ----------------------------------------------------
-- TABLE 3: member_role_assignments
-- ----------------------------------------------------
create table if not exists public.member_role_assignments (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.member_roles(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.members(id) on delete set null,
  notes text,

  constraint member_role_assignments_unique
    unique (role_id, member_id)
);

create index if not exists member_role_assignments_role_id_idx
  on public.member_role_assignments(role_id);
create index if not exists member_role_assignments_member_id_idx
  on public.member_role_assignments(member_id);

comment on table public.member_role_assignments is
  'Live association — αλλαγές εδώ επηρεάζουν αμέσως τα effective permissions.';

-- ----------------------------------------------------
-- UPDATE: member_permissions module check (+cashier)
-- ----------------------------------------------------
alter table public.member_permissions
  drop constraint if exists member_permissions_module_check;

alter table public.member_permissions
  add constraint member_permissions_module_check
  check (module = any (array[
    'calendar','members','finances','seating',
    'events','dashboard','settings','cashier'
  ]));

-- ----------------------------------------------------
-- RLS: disabled (consistent με existing pattern)
-- ----------------------------------------------------
alter table public.member_roles disable row level security;
alter table public.member_role_permissions disable row level security;
alter table public.member_role_assignments disable row level security;

-- ============================================
-- SEED: Default roles per club
-- ============================================
do $$
declare
  c record;
begin
  for c in select id from public.clubs loop
    insert into public.member_roles (club_id, name, description, is_system, display_order)
    values
      (c.id, 'Πρόεδρος ΔΣ',  'Πλήρης πρόσβαση στο σύστημα',                  true, 10),
      (c.id, 'Αντιπρόεδρος', 'Διαχείριση μελών, εκδηλώσεων, πλάνου',          true, 20),
      (c.id, 'Ταμίας',        'Διαχείριση οικονομικών και ταμείου εκδηλώσεων', true, 30),
      (c.id, 'Γραμματέας',    'Διαχείριση μελών και ημερολογίου',              true, 40),
      (c.id, 'Μέλος ΔΣ',      'Ανάγνωση μελών, πλάνου και ημερολογίου',        true, 50)
    on conflict (club_id, name) do nothing;
  end loop;
end $$;

-- ============================================
-- SEED: Permissions per role
-- ============================================
do $$
declare
  r record;
begin
  for r in select id, name from public.member_roles where is_system = true loop

    if r.name = 'Πρόεδρος ΔΣ' then
      insert into public.member_role_permissions (role_id, module, action, scope)
      select r.id, m, a, 'all'
      from unnest(array['calendar','members','finances','seating','events','dashboard','settings','cashier']) m
      cross join unnest(array['read','create','edit','delete']) a
      on conflict do nothing;

    elsif r.name = 'Αντιπρόεδρος' then
      insert into public.member_role_permissions (role_id, module, action, scope)
      select r.id, m, a, 'all'
      from unnest(array['members','events','seating','calendar']) m
      cross join unnest(array['read','create','edit','delete']) a
      on conflict do nothing;
      insert into public.member_role_permissions (role_id, module, action, scope)
      values (r.id, 'dashboard', 'read', 'all') on conflict do nothing;

    elsif r.name = 'Ταμίας' then
      insert into public.member_role_permissions (role_id, module, action, scope)
      select r.id, m, a, 'all'
      from unnest(array['finances','cashier']) m
      cross join unnest(array['read','create','edit','delete']) a
      on conflict do nothing;
      insert into public.member_role_permissions (role_id, module, action, scope)
      values (r.id, 'dashboard', 'read', 'all') on conflict do nothing;

    elsif r.name = 'Γραμματέας' then
      insert into public.member_role_permissions (role_id, module, action, scope)
      select r.id, m, a, 'all'
      from unnest(array['members','calendar']) m
      cross join unnest(array['read','create','edit','delete']) a
      on conflict do nothing;
      insert into public.member_role_permissions (role_id, module, action, scope)
      values (r.id, 'dashboard', 'read', 'all') on conflict do nothing;

    elsif r.name = 'Μέλος ΔΣ' then
      insert into public.member_role_permissions (role_id, module, action, scope)
      select r.id, m, 'read', 'all'
      from unnest(array['members','seating','calendar','events']) m
      on conflict do nothing;

    end if;
  end loop;
end $$;

-- ============================================
-- AUTO-ASSIGN: existing members βάσει board_position
-- ============================================
do $$
declare
  m record;
  target_role_name text;
  target_role_id uuid;
begin
  for m in
    select id, club_id, first_name, last_name, board_position, is_board_member
    from public.members
    where club_id is not null
      and (is_board_member = true or board_position is not null)
  loop
    target_role_name := case
      when m.board_position = 'Πρόεδρος' then 'Πρόεδρος ΔΣ'
      when m.board_position = 'Αντιπρόεδρος' then 'Αντιπρόεδρος'
      when m.board_position = 'Ταμίας' then 'Ταμίας'
      when m.board_position = 'Γραμματέας' then 'Γραμματέας'
      when m.board_position = 'Μέλος' then 'Μέλος ΔΣ'
      when m.is_board_member = true then 'Μέλος ΔΣ'
      else null
    end;

    if target_role_name is not null then
      select id into target_role_id
      from public.member_roles
      where club_id = m.club_id and name = target_role_name;

      if target_role_id is not null then
        insert into public.member_role_assignments (role_id, member_id, notes)
        values (target_role_id, m.id, 'Auto-assigned from board_position')
        on conflict (role_id, member_id) do nothing;
      end if;
    end if;
  end loop;
end $$;

-- ============================================
-- SEED: 'Απλό Μέλος' default role + auto-assignment
-- για όλους τους members χωρίς ρόλο
-- ============================================

-- Step 1: Create the 'Απλό Μέλος' role per club
do $$
declare
  c record;
begin
  for c in select id from public.clubs loop
    insert into public.member_roles (club_id, name, description, is_system, display_order)
    values (
      c.id,
      'Απλό Μέλος',
      'Βασική πρόσβαση: ημερολόγιο και προβολή εκδηλώσεων',
      true,
      100
    )
    on conflict (club_id, name) do nothing;
  end loop;
end $$;

-- Step 2: Seed permissions for 'Απλό Μέλος' (calendar:read, events:read)
do $$
declare
  r record;
begin
  for r in
    select id from public.member_roles
    where name = 'Απλό Μέλος' and is_system = true
  loop
    insert into public.member_role_permissions (role_id, module, action, scope)
    select r.id, m, 'read', 'all'
    from unnest(array['calendar','events']) m
    on conflict do nothing;
  end loop;
end $$;

-- Step 3: Auto-assign 'Απλό Μέλος' σε members χωρίς κανένα ρόλο
do $$
declare
  m record;
  basic_role_id uuid;
begin
  for m in
    select id, club_id
    from public.members
    where club_id is not null
      and not exists (
        select 1 from public.member_role_assignments a
        where a.member_id = members.id
      )
  loop
    select id into basic_role_id
    from public.member_roles
    where club_id = m.club_id and name = 'Απλό Μέλος';

    if basic_role_id is not null then
      insert into public.member_role_assignments (role_id, member_id, notes)
      values (basic_role_id, m.id, 'Auto-assigned: default basic member access')
      on conflict (role_id, member_id) do nothing;
    end if;
  end loop;
end $$;

-- End of migration 0005
