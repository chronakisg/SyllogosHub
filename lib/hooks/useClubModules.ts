"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import type { ClubModule, ClubModuleRow } from "@/lib/supabase/types";
import { CORE_CLUB_MODULES } from "@/lib/supabase/types";

export type ClubModulesState = {
  loading: boolean;
  enabled: Set<ClubModule>;
};

const INITIAL: ClubModulesState = {
  loading: true,
  enabled: new Set(CORE_CLUB_MODULES),
};

const cache = new Map<string, Set<ClubModule>>();

export function invalidateClubModulesCache(clubId?: string): void {
  if (clubId) cache.delete(clubId);
  else cache.clear();
}

export function useClubModules(clubId: string | null): ClubModulesState {
  const [state, setState] = useState<ClubModulesState>(INITIAL);

  useEffect(() => {
    if (!clubId) {
      setState({ loading: false, enabled: new Set(CORE_CLUB_MODULES) });
      return;
    }

    const cached = cache.get(clubId);
    if (cached) {
      setState({ loading: false, enabled: cached });
      return;
    }

    let cancelled = false;
    const supabase = getBrowserClient();

    setState((prev) => ({ ...prev, loading: true }));

    void (async () => {
      const { data, error } = await supabase
        .from("club_modules")
        .select("module, enabled")
        .eq("club_id", clubId);

      if (cancelled) return;

      const enabled = new Set<ClubModule>(CORE_CLUB_MODULES);
      if (!error && data) {
        for (const row of data as Pick<ClubModuleRow, "module" | "enabled">[]) {
          if (row.enabled) enabled.add(row.module);
          else if (!CORE_CLUB_MODULES.includes(row.module)) enabled.delete(row.module);
        }
      }

      cache.set(clubId, enabled);
      setState({ loading: false, enabled });
    })();

    function handleRefresh() {
      cache.delete(clubId!);
      setState((prev) => ({ ...prev, loading: true }));
    }
    if (typeof window !== "undefined") {
      window.addEventListener("syllogoshub:refresh-club-modules", handleRefresh);
    }

    return () => {
      cancelled = true;
      if (typeof window !== "undefined") {
        window.removeEventListener("syllogoshub:refresh-club-modules", handleRefresh);
      }
    };
  }, [clubId]);

  return state;
}
