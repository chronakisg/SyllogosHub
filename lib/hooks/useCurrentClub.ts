"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import type { Club, ClubSettings } from "@/lib/supabase/types";

const IMPERSONATE_KEY = "syllogoshub.impersonate_club_id";

export type CurrentClubState = {
  clubId: string | null;
  club: Club | null;
  settings: ClubSettings | null;
  loading: boolean;
};

const INITIAL: CurrentClubState = {
  clubId: null,
  club: null,
  settings: null,
  loading: true,
};

const SIGNED_OUT: CurrentClubState = {
  clubId: null,
  club: null,
  settings: null,
  loading: false,
};

type CacheEntry = {
  club: Club | null;
  settings: ClubSettings | null;
};

const cache = new Map<string, CacheEntry>();

function readImpersonateClubId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const url = new URL(window.location.href);
    const fromQuery = url.searchParams.get("club");
    if (fromQuery) return fromQuery;
    return window.localStorage.getItem(IMPERSONATE_KEY);
  } catch {
    return null;
  }
}

export function useCurrentClub(): CurrentClubState {
  const [state, setState] = useState<CurrentClubState>(INITIAL);

  useEffect(() => {
    let cancelled = false;
    const supabase = getBrowserClient();

    async function loadFor(clubId: string) {
      const cached = cache.get(clubId);
      if (cached) {
        if (cancelled) return;
        setState({
          clubId,
          club: cached.club,
          settings: cached.settings,
          loading: false,
        });
        return;
      }
      const [cRes, sRes] = await Promise.all([
        supabase.from("clubs").select("*").eq("id", clubId).maybeSingle(),
        supabase
          .from("club_settings")
          .select("*")
          .eq("club_id", clubId)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      const club = (cRes.data as Club | null) ?? null;
      const settings = (sRes.data as ClubSettings | null) ?? null;
      cache.set(clubId, { club, settings });
      setState({ clubId, club, settings, loading: false });
    }

    async function resolve() {
      const { data: userData } = await supabase.auth.getUser();
      if (cancelled) return;
      const user = userData.user;
      if (!user) {
        // eslint-disable-next-line no-console
        console.log("[useCurrentClub] no auth user");
        setState(SIGNED_OUT);
        return;
      }

      const lookupEmail = user.email ?? null;
      let clubId: string | null = null;

      const impersonate = readImpersonateClubId();

      if (lookupEmail) {
        const memRes = await supabase
          .from("members")
          .select("id, club_id, is_system_admin, email")
          .ilike("email", lookupEmail)
          .maybeSingle();
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.log("[useCurrentClub] member lookup", {
          authEmail: lookupEmail,
          error: memRes.error?.message ?? null,
          memberRow: memRes.data,
          impersonate,
        });
        const memberRow = memRes.data as
          | {
              id: string;
              club_id: string | null;
              is_system_admin: boolean | null;
              email: string | null;
            }
          | null;
        if (memberRow?.is_system_admin && impersonate) {
          clubId = impersonate;
        } else {
          clubId = memberRow?.club_id ?? null;
        }
      }

      if (!clubId) {
        // eslint-disable-next-line no-console
        console.log("[useCurrentClub] resolved clubId=null → SIGNED_OUT");
        setState({ ...SIGNED_OUT, loading: false });
        return;
      }

      // eslint-disable-next-line no-console
      console.log("[useCurrentClub] resolved clubId", clubId);
      await loadFor(clubId);
    }

    setState((prev) => ({ ...prev, loading: true }));
    void resolve();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      if (!user) {
        setState(SIGNED_OUT);
        return;
      }
      setState((prev) => ({ ...prev, loading: true }));
      void resolve();
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}

export function setImpersonatedClub(clubId: string | null): void {
  if (typeof window === "undefined") return;
  if (clubId) window.localStorage.setItem(IMPERSONATE_KEY, clubId);
  else window.localStorage.removeItem(IMPERSONATE_KEY);
}
