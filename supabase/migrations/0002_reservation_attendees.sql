-- 0002_reservation_attendees.sql
-- Title:       Add reservation_attendees table for guest list management
-- Date:        2026-04-30
-- Description:
--   Tracks individual attendees per reservation with three identity states:
--     - member     (member_id set, guest_name null)
--     - guest      (member_id null, guest_name set)
--     - anonymous  (both null — used for backfill of existing reservations)
--
--   Backfills existing reservations: each reservation gets N anonymous
--   attendee rows matching its pax_count. The club_id is copied from the
--   parent reservation (nullable, matching reservations.club_id semantics).
--
-- Rollback (manual):
--   drop table public.reservation_attendees;
--
-- Notes:
--   - The reservations.guests jsonb column is intentionally NOT touched
--     here. It is currently empty/unused and will be cleaned up in a
--     follow-up migration.
--   - The set_updated_at() trigger function is not defined in
--     0001_initial_schema.sql but exists in the live database (verified
--     via information_schema.routines). A trigger is attached below to
--     keep updated_at in sync on UPDATE.

-- ============================================================
-- Table
-- ============================================================
create table public.reservation_attendees (
  id              uuid primary key default gen_random_uuid(),
  reservation_id  uuid not null references public.reservations(id) on delete cascade,
  club_id         uuid references public.clubs(id),

  -- Identity (one of: member / guest / anonymous)
  member_id       uuid references public.members(id) on delete set null,
  guest_name      text,

  -- Metadata
  is_lead         boolean not null default false,
  notes           text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint chk_attendee_identity check (
    (member_id is not null and guest_name is null) or
    (member_id is null and guest_name is not null) or
    (member_id is null and guest_name is null)
  )
);

-- ============================================================
-- Indexes
-- ============================================================
create index idx_attendees_member
  on public.reservation_attendees(member_id)
  where member_id is not null;

create index idx_attendees_reservation
  on public.reservation_attendees(reservation_id);

create index idx_attendees_club
  on public.reservation_attendees(club_id)
  where club_id is not null;

-- Prevent the same member appearing twice in the same reservation/parea.
create unique index idx_attendees_member_unique
  on public.reservation_attendees(reservation_id, member_id)
  where member_id is not null;

-- ============================================================
-- RLS — match the rest of the schema (authenticated-only access)
-- ============================================================
alter table public.reservation_attendees enable row level security;

create policy "reservation_attendees_authenticated_all"
  on public.reservation_attendees for all to authenticated
  using (true) with check (true);

-- ============================================================
-- updated_at trigger — uses public.set_updated_at() (exists in live DB)
-- ============================================================
create trigger trg_attendees_updated_at
  before update on public.reservation_attendees
  for each row execute function public.set_updated_at();

-- ============================================================
-- Backfill — N anonymous attendees per existing reservation,
-- copying club_id from the parent reservation.
-- ============================================================
do $$
declare
  r record;
  i int;
begin
  for r in
    select id, club_id, pax_count
    from public.reservations
    where pax_count > 0
  loop
    for i in 1..r.pax_count loop
      insert into public.reservation_attendees (reservation_id, club_id)
      values (r.id, r.club_id);
    end loop;
  end loop;
end $$;
