-- SyllogosHub — Initial Schema
-- Εκτέλεση στο Supabase SQL editor ή μέσω `supabase db push`

create extension if not exists "pgcrypto";

-- ============================================================
-- Μέλη (members)
-- ============================================================
create table if not exists public.members (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  phone       text,
  email       text,
  department  text,
  status      text not null default 'active' check (status in ('active', 'inactive')),
  created_at  timestamptz not null default now()
);

create index if not exists members_status_idx     on public.members (status);
create index if not exists members_department_idx on public.members (department);
create index if not exists members_full_name_idx  on public.members (full_name);

-- ============================================================
-- Πληρωμές (payments)
-- ============================================================
create table if not exists public.payments (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null references public.members (id) on delete cascade,
  amount        numeric(10, 2) not null check (amount >= 0),
  payment_date  date not null default current_date,
  type          text not null check (type in ('monthly_fee', 'annual')),
  period        text, -- π.χ. '2024-05' για μηνιαία, '2024' για ετήσια
  created_at    timestamptz not null default now()
);

create index if not exists payments_member_idx on public.payments (member_id);
create index if not exists payments_period_idx on public.payments (period);
create index if not exists payments_date_idx   on public.payments (payment_date);

-- ============================================================
-- Εκδηλώσεις (events)
-- ============================================================
create table if not exists public.events (
  id                uuid primary key default gen_random_uuid(),
  event_name        text not null,
  event_date        date not null,
  venue_map_config  jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);

create index if not exists events_date_idx on public.events (event_date);

-- ============================================================
-- Κρατήσεις / Παρέες (reservations)
-- ============================================================
create table if not exists public.reservations (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events (id) on delete cascade,
  group_name    text not null,
  pax_count     int  not null check (pax_count > 0),
  table_number  int,
  is_paid       boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists reservations_event_idx on public.reservations (event_id);

-- Ένα τραπέζι δεν μπορεί να δοθεί σε δύο παρέες για την ίδια εκδήλωση
create unique index if not exists reservations_event_table_unique
  on public.reservations (event_id, table_number)
  where table_number is not null;

-- ============================================================
-- Row Level Security — μόνο συνδεδεμένα μέλη ΔΣ έχουν πρόσβαση
-- ============================================================
alter table public.members      enable row level security;
alter table public.payments     enable row level security;
alter table public.events       enable row level security;
alter table public.reservations enable row level security;

create policy "members_authenticated_all"
  on public.members for all to authenticated
  using (true) with check (true);

create policy "payments_authenticated_all"
  on public.payments for all to authenticated
  using (true) with check (true);

create policy "events_authenticated_all"
  on public.events for all to authenticated
  using (true) with check (true);

create policy "reservations_authenticated_all"
  on public.reservations for all to authenticated
  using (true) with check (true);

-- ============================================================
-- Realtime — συγχρονισμός του πλάνου τραπεζιών σε όλες τις συσκευές
-- ============================================================
alter publication supabase_realtime add table public.reservations;
