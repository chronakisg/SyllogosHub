"use client";

import { useState, type FormEvent } from "react";

type State = "idle" | "sending" | "sent" | "error";

export default function PortalLoginPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setState("sending");
    setErrorMessage("");

    try {
      const res = await fetch("/api/portal/auth/send-magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErrorMessage(body.error ?? "Σφάλμα αποστολής");
        setState("error");
        return;
      }

      setState("sent");
    } catch {
      setErrorMessage("Σφάλμα δικτύου");
      setState("error");
    }
  }

  function handleReset() {
    setEmail("");
    setState("idle");
    setErrorMessage("");
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-8 shadow-sm">
        <header className="mb-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-[#800000] text-lg font-semibold text-white">
            Σ
          </div>
          <h1 className="mt-3 text-xl font-semibold tracking-tight">
            Σύνδεση στο portal
          </h1>
          <p className="mt-1 text-sm text-muted">
            Συνδεθείτε με τον σύνδεσμο που θα λάβετε στο email σας
          </p>
        </header>

        {state === "sent" ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-400">
              <p className="font-medium">
                ✓ Στείλαμε σύνδεσμο στο {email}.
              </p>
              <p className="mt-1">
                Δείτε τα εισερχόμενά σας. Ο σύνδεσμος ισχύει για 1 ώρα.
              </p>
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="w-full rounded-lg border border-border px-4 py-2 text-sm transition hover:bg-background"
            >
              Αποστολή σε άλλο email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">
                Email
              </span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={state === "sending"}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[#800000] focus:ring-2 focus:ring-[#800000]/20 disabled:opacity-50"
              />
            </label>

            {state === "error" && errorMessage && (
              <p className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
                {errorMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={state === "sending" || !email.trim()}
              className="w-full rounded-lg bg-[#800000] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#660000] disabled:opacity-50"
            >
              {state === "sending" ? "Αποστολή…" : "Αποστολή συνδέσμου"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
