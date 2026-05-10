"use client";

import { useState, type FormEvent } from "react";
import { DateInput } from "@/components/DateInput";

type FormData = {
  phone: string | null;
  birth_date: string | null;
  birthplace: string | null;
  residence: string | null;
  address: string | null;
  occupation: string | null;
  father_name: string | null;
  mother_name: string | null;
  maiden_name: string | null;
};

type State = "idle" | "saving" | "saved" | "error";

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[#800000] focus:ring-2 focus:ring-[#800000]/20";

export function ProfileEditForm({ initialData }: { initialData: FormData }) {
  const [data, setData] = useState<FormData>(initialData);
  const [state, setState] = useState<State>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  function setField<K extends keyof FormData>(key: K, value: FormData[K]) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setState("saving");
    setErrorMessage("");

    try {
      const res = await fetch("/api/portal/profile/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErrorMessage(body.error ?? "Σφάλμα αποθήκευσης");
        setState("error");
        return;
      }

      setState("saved");
      setTimeout(() => setState("idle"), 2500);
    } catch {
      setErrorMessage("Σφάλμα δικτύου");
      setState("error");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">
            Τηλέφωνο
          </span>
          <input
            type="tel"
            value={data.phone ?? ""}
            onChange={(e) => setField("phone", e.target.value || null)}
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">
            Ημερομηνία γέννησης
          </span>
          <DateInput
            value={data.birth_date ?? ""}
            onChange={(iso) => setField("birth_date", iso || null)}
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">
            Τόπος γέννησης
          </span>
          <input
            type="text"
            value={data.birthplace ?? ""}
            onChange={(e) => setField("birthplace", e.target.value || null)}
            className={inputClass}
          />
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-muted">
            Διεύθυνση (οδός, αριθμός)
          </span>
          <input
            type="text"
            value={data.address ?? ""}
            onChange={(e) => setField("address", e.target.value || null)}
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">
            Τόπος κατοικίας
          </span>
          <input
            type="text"
            value={data.residence ?? ""}
            onChange={(e) => setField("residence", e.target.value || null)}
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">
            Επάγγελμα
          </span>
          <input
            type="text"
            value={data.occupation ?? ""}
            onChange={(e) => setField("occupation", e.target.value || null)}
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">
            Πατρώνυμο
          </span>
          <input
            type="text"
            value={data.father_name ?? ""}
            onChange={(e) => setField("father_name", e.target.value || null)}
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">
            Μητρώνυμο
          </span>
          <input
            type="text"
            value={data.mother_name ?? ""}
            onChange={(e) => setField("mother_name", e.target.value || null)}
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">
            Πατρικό επώνυμο
          </span>
          <input
            type="text"
            value={data.maiden_name ?? ""}
            onChange={(e) => setField("maiden_name", e.target.value || null)}
            className={inputClass}
          />
        </label>
      </div>

      {state === "error" && errorMessage && (
        <p className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          {errorMessage}
        </p>
      )}

      {state === "saved" && (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-400">
          ✓ Αποθηκεύτηκε
        </p>
      )}

      <button
        type="submit"
        disabled={state === "saving"}
        className="rounded-lg bg-[#800000] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#660000] disabled:opacity-50"
      >
        {state === "saving" ? "Αποθήκευση…" : "Αποθήκευση"}
      </button>
    </form>
  );
}
