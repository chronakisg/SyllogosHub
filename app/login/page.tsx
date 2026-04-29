"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { errorMessage, getBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center text-muted">
          Φόρτωση…
        </div>
      }
    >
      <LoginView />
    </Suspense>
  );
}

function LoginView() {
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get("redirect") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    console.log("[login] handleSubmit fired", {
      email: email.trim(),
      hasPassword: password.length > 0,
      redirect,
    });
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      console.log("[login] getting browser client");
      const supabase = getBrowserClient();
      console.log("[login] calling signInWithPassword…");
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      console.log("[login] signInWithPassword resolved", {
        hasSession: !!data?.session,
        userId: data?.user?.id ?? null,
        signInError,
      });
      if (signInError) throw signInError;
      console.log("[login] verifying session via getSession()");
      const sessionRes = await supabase.auth.getSession();
      console.log("[login] getSession", {
        hasSession: !!sessionRes.data.session,
        cookieString:
          typeof document !== "undefined" ? document.cookie : "(no document)",
      });
      console.log("[login] router.replace →", redirect);
      router.replace(redirect);
      console.log("[login] router.refresh()");
      router.refresh();
    } catch (err) {
      console.error("[login] caught error", err);
      setError(errorMessage(err, "Αποτυχία σύνδεσης."));
    } finally {
      console.log("[login] handleSubmit finally — setSubmitting(false)");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-8 shadow-sm">
        <header className="mb-6 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-base font-semibold text-white">
            Σ
          </div>
          <h1 className="mt-3 text-xl font-semibold tracking-tight">
            SyllogosHub
          </h1>
          <p className="mt-1 text-sm text-muted">
            Συνδεθείτε στον λογαριασμό σας
          </p>
        </header>

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
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">
              Κωδικός
            </span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </label>

          {error && (
            <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Σύνδεση…" : "Σύνδεση"}
          </button>
        </form>
      </div>
    </div>
  );
}
