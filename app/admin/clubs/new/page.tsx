"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type FormState = {
  name: string;
  slug: string;
  plan: "basic" | "pro" | "premium";
  adminEmail: string;
  adminPassword: string;
  adminFirstName: string;
  adminLastName: string;
};

const INITIAL: FormState = {
  name: "",
  slug: "",
  plan: "pro",
  adminEmail: "",
  adminPassword: "",
  adminFirstName: "",
  adminLastName: "",
};

const INPUT_CLASS =
  "w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-[#800000] focus:outline-none focus:ring-2 focus:ring-[#800000]/20";

export default function NewClubPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/clubs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = (await res.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!res.ok) {
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      router.replace("/admin/clubs?created=1");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Αποτυχία δημιουργίας συλλόγου",
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <Link
          href="/admin/clubs"
          className="text-[#800000] hover:underline text-sm"
        >
          ← Πίσω στους συλλόγους
        </Link>
        <h1 className="text-2xl font-semibold mt-2">Νέος Σύλλογος</h1>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-lg border border-gray-200 p-6 space-y-4"
      >
        <Field label="Όνομα Συλλόγου" required>
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            className={INPUT_CLASS}
          />
        </Field>

        <Field
          label="Slug"
          required
          hint="Lowercase, αλφαριθμητικό + παύλες (π.χ. kriton-aigaleo)"
        >
          <input
            type="text"
            required
            pattern="^[a-z0-9]+(-[a-z0-9]+)*$"
            value={form.slug}
            onChange={(e) => update("slug", e.target.value.toLowerCase())}
            className={`${INPUT_CLASS} font-mono`}
          />
        </Field>

        <Field label="Πλάνο" required>
          <select
            required
            value={form.plan}
            onChange={(e) =>
              update("plan", e.target.value as FormState["plan"])
            }
            className={INPUT_CLASS}
          >
            <option value="basic">basic</option>
            <option value="pro">pro</option>
            <option value="premium">premium</option>
          </select>
        </Field>

        <hr className="border-gray-200" />
        <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
          Διαχειριστής (Πρόεδρος)
        </h2>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Όνομα" required>
            <input
              type="text"
              required
              value={form.adminFirstName}
              onChange={(e) => update("adminFirstName", e.target.value)}
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="Επώνυμο" required>
            <input
              type="text"
              required
              value={form.adminLastName}
              onChange={(e) => update("adminLastName", e.target.value)}
              className={INPUT_CLASS}
            />
          </Field>
        </div>

        <Field label="Email" required>
          <input
            type="email"
            required
            value={form.adminEmail}
            onChange={(e) => update("adminEmail", e.target.value)}
            className={INPUT_CLASS}
          />
        </Field>

        <Field label="Κωδικός" required hint="Τουλάχιστον 8 χαρακτήρες">
          <input
            type="password"
            required
            minLength={8}
            value={form.adminPassword}
            onChange={(e) => update("adminPassword", e.target.value)}
            className={INPUT_CLASS}
          />
        </Field>

        {error && (
          <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Link
            href="/admin/clubs"
            className="px-4 py-2 rounded border border-gray-300 text-sm hover:bg-gray-50"
          >
            Άκυρο
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="bg-[#800000] text-white px-4 py-2 rounded text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Δημιουργία…" : "Δημιουργία Συλλόγου"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-600 ml-1">*</span>}
      </span>
      {children}
      {hint && (
        <span className="mt-1 block text-xs text-gray-500">{hint}</span>
      )}
    </label>
  );
}
