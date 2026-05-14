"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase/client";

type State = "idle" | "sending" | "sent" | "error";

export default function PortalLoginPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const router = useRouter();

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

  async function handlePasswordLogin(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;

    setPasswordSubmitting(true);
    setPasswordError("");

    try {
      const supabase = getBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        setPasswordError("Λάθος email ή κωδικός");
        setPasswordSubmitting(false);
        return;
      }
      await supabase.auth.getSession();
      router.replace("/portal/profile");
      router.refresh();
    } catch {
      setPasswordError("Σφάλμα δικτύου");
      setPasswordSubmitting(false);
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
            Συνδεθείτε με τον κωδικό σας ή λάβετε σύνδεσμο email
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
          <div className="space-y-6">
            {/* Password login form (primary) */}
            <form onSubmit={handlePasswordLogin} className="space-y-4">
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
                  disabled={passwordSubmitting || state === "sending"}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[#800000] focus:ring-2 focus:ring-[#800000]/20 disabled:opacity-50"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted">
                  Κωδικός
                </span>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={passwordSubmitting}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 pr-10 text-sm outline-none focus:border-[#800000] focus:ring-2 focus:ring-[#800000]/20 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-[#800000] focus:outline-none focus:ring-2 focus:ring-[#800000] rounded"
                    aria-label={showPassword ? "Απόκρυψη κωδικού" : "Εμφάνιση κωδικού"}
                  >
                    {showPassword ? (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                        <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                        <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                        <line x1="2" x2="22" y1="2" y2="22" />
                      </svg>
                    ) : (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </label>

              {passwordError && (
                <p className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
                  {passwordError}
                </p>
              )}

              <button
                type="submit"
                disabled={passwordSubmitting || !email.trim() || !password}
                className="w-full rounded-lg bg-[#800000] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#660000] disabled:opacity-50"
              >
                {passwordSubmitting ? "Σύνδεση…" : "Σύνδεση"}
              </button>
            </form>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-surface px-2 text-muted">ή</span>
              </div>
            </div>

            {/* Magic link form (secondary) */}
            <form onSubmit={handleSubmit} className="space-y-3">
              <p className="text-xs text-muted">
                Ξέχασες τον κωδικό σου; Λάβε σύνδεσμο σύνδεσης στο email σου:
              </p>

              {state === "error" && errorMessage && (
                <p className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
                  {errorMessage}
                </p>
              )}

              <button
                type="submit"
                disabled={state === "sending" || !email.trim() || passwordSubmitting}
                className="w-full rounded-lg border border-[#800000] bg-transparent px-4 py-2 text-sm font-medium text-[#800000] transition hover:bg-[#800000]/5 disabled:opacity-50"
              >
                {state === "sending" ? "Αποστολή…" : "Στείλε μου σύνδεσμο email"}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
