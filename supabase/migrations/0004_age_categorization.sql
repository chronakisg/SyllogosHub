-- 0004_age_categorization.sql
-- Catering threshold (per club) + per-attendee child override.
-- Independent από discount_rules.age_max (pricing concern, ξεχωριστό domain).

alter table public.clubs
  add column if not exists child_age_threshold smallint
    not null default 15
    check (child_age_threshold >= 0 and child_age_threshold <= 30);

alter table public.reservation_attendees
  add column if not exists is_child_override boolean
    default null;
-- NULL  = fall back to auto-derive (member.birth_date vs club threshold)
-- TRUE  = explicit child override
-- FALSE = explicit adult override

-- Proactive: keep RLS off (idempotent if already disabled).
alter table public.clubs disable row level security;
alter table public.reservation_attendees disable row level security;

-- Backfill kriton-aigaleo σε 15 (idempotent).
update public.clubs
   set child_age_threshold = 15
 where slug = 'kriton-aigaleo'
   and child_age_threshold is distinct from 15;
