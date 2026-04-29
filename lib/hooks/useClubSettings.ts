"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import type { ClubSettings } from "@/lib/supabase/types";

export const DEFAULT_CLUB_NAME = "SyllogosHub";
export const DEFAULT_PRIMARY = "#2563eb";
export const DEFAULT_SECONDARY = "#1e40af";
export const DEFAULT_ACCENT = "#f59e0b";

export const FALLBACK_SETTINGS: ClubSettings = {
  id: "",
  club_name: DEFAULT_CLUB_NAME,
  logo_url: null,
  primary_color: DEFAULT_PRIMARY,
  secondary_color: DEFAULT_SECONDARY,
  accent_color: DEFAULT_ACCENT,
  address: null,
  phone: null,
  email: null,
  website: null,
  facebook_url: null,
  instagram_url: null,
  tax_id: null,
  founded_year: null,
  updated_at: new Date(0).toISOString(),
};

type CacheState = {
  settings: ClubSettings | null;
  inFlight: Promise<ClubSettings | null> | null;
  listeners: Set<(s: ClubSettings | null) => void>;
};

const cache: CacheState = {
  settings: null,
  inFlight: null,
  listeners: new Set(),
};

function applyCssVars(s: ClubSettings | null) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
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

async function fetchSettings(): Promise<ClubSettings | null> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase
    .from("club_settings")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data as ClubSettings) ?? null;
}

function notify(s: ClubSettings | null) {
  cache.settings = s;
  applyCssVars(s);
  for (const l of cache.listeners) l(s);
}

export async function refreshClubSettings(): Promise<ClubSettings | null> {
  const next = await fetchSettings();
  notify(next);
  return next;
}

export function useClubSettings(): {
  settings: ClubSettings;
  loading: boolean;
  refresh: () => Promise<ClubSettings | null>;
} {
  const [state, setState] = useState<ClubSettings | null>(cache.settings);
  const [loading, setLoading] = useState<boolean>(cache.settings === null);

  useEffect(() => {
    let mounted = true;
    cache.listeners.add(setState);

    if (cache.settings) {
      applyCssVars(cache.settings);
      setLoading(false);
    } else {
      const promise =
        cache.inFlight ??
        (cache.inFlight = fetchSettings().finally(() => {
          cache.inFlight = null;
        }));
      promise.then((next) => {
        if (!mounted) return;
        notify(next);
        setLoading(false);
      });
    }

    return () => {
      mounted = false;
      cache.listeners.delete(setState);
    };
  }, []);

  return {
    settings: state ?? FALLBACK_SETTINGS,
    loading,
    refresh: refreshClubSettings,
  };
}
