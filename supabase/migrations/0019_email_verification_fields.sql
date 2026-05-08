-- Migration 0019: Email verification fields για members
-- Date: 2026-05-08
-- Purpose: Foundation για member email verification flow με self-update

-- Schema additions
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS email_verification_token text,
  ADD COLUMN IF NOT EXISTS email_verification_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_verification_expires_at timestamptz;

-- Partial index για efficient token lookups (μόνο όπου υπάρχει token)
CREATE INDEX IF NOT EXISTS idx_members_email_verification_token
  ON public.members(email_verification_token)
  WHERE email_verification_token IS NOT NULL;

-- RLS off (matches existing pattern)
ALTER TABLE public.members DISABLE ROW LEVEL SECURITY;
