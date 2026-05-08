"use client";

import { useEffect, useState } from "react";
import type { ClubModule } from "@/lib/supabase/types";
import {
  CLUB_MODULE_LABELS,
  CORE_CLUB_MODULES,
} from "@/lib/supabase/types";
import { invalidateClubModulesCache } from "@/lib/hooks/useClubModules";

type ModuleRow = {
  module: ClubModule;
  enabled: boolean;
};

const ALL_MODULES: ClubModule[] = [
  "members",
  "events",
  "calendar",
  "seating",
  "finances",
  "cashier",
  "communications",
];

export function ClubModulesPanel({ clubId }: { clubId: string }) {
  const [modules, setModules] = useState<Map<ClubModule, boolean>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<ClubModule | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/clubs/${clubId}/modules`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Σφάλμα φόρτωσης");
        const map = new Map<ClubModule, boolean>();
        for (const m of ALL_MODULES) map.set(m, true);
        for (const row of (json.modules ?? []) as ModuleRow[]) {
          map.set(row.module, row.enabled);
        }
        setModules(map);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Σφάλμα φόρτωσης");
      } finally {
        setLoading(false);
      }
    })();
  }, [clubId]);

  async function toggle(module: ClubModule) {
    if (CORE_CLUB_MODULES.includes(module)) return;
    const current = modules.get(module) ?? true;
    const next = !current;
    setSaving(module);
    setError(null);
    try {
      const res = await fetch(`/api/admin/clubs/${clubId}/modules`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module, enabled: next }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Σφάλμα αποθήκευσης");
      setModules((prev) => {
        const copy = new Map(prev);
        copy.set(module, next);
        return copy;
      });
      invalidateClubModulesCache(clubId);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("syllogoshub:refresh-club-modules"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Σφάλμα αποθήκευσης");
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-2">Modules</h2>
        <p className="text-sm text-gray-500">Φόρτωση...</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="mb-4">
        <h2 className="text-lg font-medium text-gray-900">Modules</h2>
        <p className="text-sm text-gray-500 mt-1">
          Ενεργοποίηση / απενεργοποίηση λειτουργιών για τον σύλλογο.
          Τα core modules (Μέλη, Εκδηλώσεις, Ημερολόγιο) είναι πάντα ενεργά.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-2">
        {ALL_MODULES.map((module) => {
          const enabled = modules.get(module) ?? true;
          const isCore = CORE_CLUB_MODULES.includes(module);
          const isSaving = saving === module;
          return (
            <div
              key={module}
              className="flex items-center justify-between rounded border border-gray-200 px-4 py-3"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900">
                  {CLUB_MODULE_LABELS[module]}
                </span>
                {isCore && (
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                    Core
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => toggle(module)}
                disabled={isCore || isSaving}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  enabled ? "bg-[#800000]" : "bg-gray-300"
                } ${isCore ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                aria-label={`Toggle ${CLUB_MODULE_LABELS[module]}`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    enabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
