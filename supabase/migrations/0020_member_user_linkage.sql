-- Migration 0020 — Member Portal Chunk 2 — auth.users linkage
-- Already applied manually in Supabase Editor on 2026-05-09
-- Snapshot table: public.members_backup_20260509_pre_portal

-- 1. Add user_id column (nullable — όχι όλα τα μέλη logged-in)
alter table public.members
  add column if not exists user_id uuid;

-- 2. FK constraint to auth.users
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'members_user_id_fkey'
  ) then
    alter table public.members
      add constraint members_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete set null;
  end if;
end $$;

-- 3. Unique constraint (1 auth.user per member)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'members_user_id_unique'
  ) then
    alter table public.members
      add constraint members_user_id_unique unique (user_id);
  end if;
end $$;

-- 4. Partial index for fast lookups
create index if not exists idx_members_user_id
  on public.members (user_id)
  where user_id is not null;

-- 5. RLS off (RLS προστίθεται στο Commit 7)
alter table public.members disable row level security;
