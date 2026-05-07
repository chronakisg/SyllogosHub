"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Club, ClubPlan } from "@/lib/supabase/types";

type ClubProps = Pick<Club, "id" | "slug" | "plan" | "is_active">;

const PLAN_BADGE: Record<string, string> = {
  basic: "bg-gray-200 text-gray-800",
  pro: "bg-blue-100 text-blue-800",
  premium: "bg-[#800000]/10 text-[#800000]",
};

type Mode = "view" | "editing" | "deleting";

const INPUT_CLASS =
  "w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-[#800000] focus:outline-none focus:ring-2 focus:ring-[#800000]/20";

export function ClubEditPanel({ club }: { club: ClubProps }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("view");
  const [planValue, setPlanValue] = useState<ClubPlan>(club.plan);
  const [isActiveValue, setIsActiveValue] = useState<boolean>(club.is_active);
  const [confirmSlugInput, setConfirmSlugInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit() {
    setPlanValue(club.plan);
    setIsActiveValue(club.is_active);
    setError(null);
    setMode("editing");
  }

  function startDelete() {
    setConfirmSlugInput("");
    setError(null);
    setMode("deleting");
  }

  function cancel() {
    setError(null);
    setMode("view");
  }

  async function saveEdits() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/clubs/${club.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          plan: planValue,
          is_active: isActiveValue,
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!res.ok) {
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      setMode("view");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Αποτυχία αποθήκευσης");
    } finally {
      setSaving(false);
    }
  }

  async function deleteClub() {
    setError(null);
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/clubs/${club.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ confirmSlug: club.slug }),
      });
      const body = (await res.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!res.ok) {
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      router.push("/admin/clubs?deleted=1");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Αποτυχία διαγραφής");
      setDeleting(false);
    }
  }

  // ─────────── view mode ───────────
  if (mode === "view") {
    return (
      <div className="bg-white rounded-lg border border-gray-200 border-l-4 border-l-[#800000] p-6">
        <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-4">
          Πλάνο & Κατάσταση
        </h2>

        <div className="space-y-2 mb-4">
          <Row label="Πλάνο">
            <span
              className={`px-2 py-1 rounded text-xs font-medium ${
                PLAN_BADGE[club.plan] ?? "bg-gray-100 text-gray-700"
              }`}
            >
              {club.plan}
            </span>
          </Row>
          <Row label="Κατάσταση">
            {club.is_active ? (
              <span className="px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
                Ενεργός
              </span>
            ) : (
              <span className="px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-800">
                Ανενεργός
              </span>
            )}
          </Row>
        </div>

        <div className="flex items-center justify-between gap-2 pt-3 border-t border-gray-100">
          <button
            onClick={startEdit}
            className="text-sm border border-[#800000] text-[#800000] px-4 py-2 rounded hover:bg-[#800000]/5 transition-colors"
          >
            Επεξεργασία
          </button>
          <button
            onClick={startDelete}
            className="text-sm text-red-600 hover:text-red-800 hover:bg-red-50 px-3 py-2 rounded transition-colors"
          >
            Οριστική Διαγραφή
          </button>
        </div>
      </div>
    );
  }

  // ─────────── editing mode ───────────
  if (mode === "editing") {
    return (
      <div className="bg-white rounded-lg border border-gray-200 border-l-4 border-l-[#800000] p-6">
        <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-4">
          Επεξεργασία
        </h2>

        <div className="space-y-4 mb-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">
              Πλάνο
            </span>
            <select
              value={planValue}
              onChange={(e) => setPlanValue(e.target.value as ClubPlan)}
              className={INPUT_CLASS}
              disabled={saving}
            >
              <option value="basic">basic</option>
              <option value="pro">pro</option>
              <option value="premium">premium</option>
            </select>
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActiveValue}
              onChange={(e) => setIsActiveValue(e.target.checked)}
              disabled={saving}
              className="h-4 w-4 rounded border-gray-300 text-[#800000] focus:ring-[#800000]/20"
            />
            <span className="text-gray-700">Ενεργός σύλλογος</span>
          </label>
        </div>

        {error && (
          <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800 mb-3">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
          <button
            onClick={cancel}
            disabled={saving}
            className="text-sm text-gray-600 hover:bg-gray-100 px-3 py-2 rounded transition-colors disabled:opacity-50"
          >
            Άκυρο
          </button>
          <button
            onClick={saveEdits}
            disabled={saving}
            className="text-sm bg-[#800000] text-white px-4 py-2 rounded font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Αποθήκευση…" : "Αποθήκευση"}
          </button>
        </div>
      </div>
    );
  }

  // ─────────── deleting mode ───────────
  const slugMatches = confirmSlugInput === club.slug;
  return (
    <div className="bg-white rounded-lg border border-gray-200 border-l-4 border-l-red-600 p-6">
      <h2 className="text-sm font-semibold text-red-700 uppercase tracking-wide mb-4">
        Οριστική Διαγραφή Συλλόγου
      </h2>

      <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800 mb-4">
        Η ενέργεια αυτή είναι μη αναστρέψιμη. Θα διαγραφούν ΟΛΑ τα δεδομένα
        του συλλόγου: μέλη, εκδηλώσεις, κρατήσεις, οικονομικά, ρυθμίσεις.
      </div>

      <label className="block mb-4">
        <span className="mb-1 block text-sm text-gray-700">
          Πληκτρολογήστε{" "}
          <code className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded text-[#800000]">
            {club.slug}
          </code>{" "}
          για επιβεβαίωση
        </span>
        <input
          type="text"
          value={confirmSlugInput}
          onChange={(e) => setConfirmSlugInput(e.target.value)}
          disabled={deleting}
          autoComplete="off"
          spellCheck={false}
          className={`${INPUT_CLASS} font-mono`}
        />
      </label>

      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800 mb-3">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
        <button
          onClick={cancel}
          disabled={deleting}
          className="text-sm text-gray-600 hover:bg-gray-100 px-3 py-2 rounded transition-colors disabled:opacity-50"
        >
          Άκυρο
        </button>
        <button
          onClick={deleteClub}
          disabled={!slugMatches || deleting}
          className="text-sm bg-red-600 text-white px-4 py-2 rounded font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {deleting ? "Διαγραφή…" : "Διαγραφή"}
        </button>
      </div>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-gray-600">{label}</span>
      <span className="text-sm">{children}</span>
    </div>
  );
}
