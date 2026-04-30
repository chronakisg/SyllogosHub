"use client";

import { useEffect, useState } from "react";
import { useCurrentClub } from "@/lib/hooks/useCurrentClub";
import type { ClubSettings } from "@/lib/supabase/types";

export const DEFAULT_CLUB_NAME = "SyllogosHub";
export const DEFAULT_PRIMARY = "#800000";
export const DEFAULT_SECONDARY = "#000000";
export const DEFAULT_ACCENT = "#f59e0b";

export const FALLBACK_SETTINGS: ClubSettings = {
  id: "",
  club_id: null,
  logo_url: null,
  primary_color: DEFAULT_PRIMARY,
  secondary_color: DEFAULT_SECONDARY,
  accent_color: DEFAULT_ACCENT,
  theme_preset: "classic",
  favicon_url: null,
  custom_domain: null,
  metadata: null,
  address: null,
  phone: null,
  email: null,
  website: null,
  facebook_url: null,
  instagram_url: null,
  afm: null,
  foundation_year: null,
  updated_at: new Date(0).toISOString(),
};

function applyCssVars(s: ClubSettings | null) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  // Set only brand variables. The @theme inline mapping in globals.css
  // already exposes them as Tailwind classes (bg-accent, etc.). Setting
  // --color-* directly would override the @theme mappings and break
  // unrelated text/background colors that share the same token names.
  root.style.setProperty(
    "--brand-primary",
    s?.primary_color || DEFAULT_PRIMARY
  );
  root.style.setProperty(
    "--brand-secondary",
    s?.secondary_color || DEFAULT_SECONDARY
  );
  root.style.setProperty(
    "--brand-accent",
    s?.accent_color || DEFAULT_ACCENT
  );
}

export async function refreshClubSettings(): Promise<void> {
  // No-op: useCurrentClub re-runs on auth change. For explicit refresh of
  // settings after a /settings save, call this from the settings page.
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("syllogoshub:refresh-club"));
  }
}

export function useClubSettings(): {
  settings: ClubSettings;
  clubName: string;
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const { club, settings, loading } = useCurrentClub();
  const [, force] = useState(0);

  useEffect(() => {
    applyCssVars(settings);
  }, [settings]);

  useEffect(() => {
    function handler() {
      force((n) => n + 1);
    }
    window.addEventListener("syllogoshub:refresh-club", handler);
    return () =>
      window.removeEventListener("syllogoshub:refresh-club", handler);
  }, []);

  return {
    settings: settings ?? FALLBACK_SETTINGS,
    clubName: club?.name ?? DEFAULT_CLUB_NAME,
    loading,
    refresh: refreshClubSettings,
  };
}
