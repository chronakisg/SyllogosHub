-- Club Modules: per-club feature flags
CREATE TABLE public.club_modules (
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  module text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  PRIMARY KEY (club_id, module),
  CONSTRAINT club_modules_module_check CHECK (
    module IN ('members', 'events', 'seating', 'finances', 'cashier', 'calendar', 'communications')
  )
);

ALTER TABLE public.club_modules DISABLE ROW LEVEL SECURITY;

-- Seed: enable all modules for all existing clubs
INSERT INTO public.club_modules (club_id, module)
SELECT c.id, m.module
FROM public.clubs c
CROSS JOIN (
  VALUES
    ('members'), ('events'), ('seating'),
    ('finances'), ('cashier'), ('calendar'),
    ('communications')
) AS m(module)
ON CONFLICT DO NOTHING;
