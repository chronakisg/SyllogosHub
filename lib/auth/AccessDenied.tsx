"use client";

import Link from "next/link";

export function AccessDenied() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="rounded-xl border border-border bg-surface p-6 text-sm">
        <h1 className="text-lg font-semibold">
          Δεν έχετε πρόσβαση σε αυτή τη σελίδα
        </h1>
        <p className="mt-2 text-muted">
          Δεν διαθέτετε το απαραίτητο δικαίωμα για να δείτε αυτό το
          περιεχόμενο. Επικοινωνήστε με τον διαχειριστή του συλλόγου αν
          πιστεύετε ότι πρόκειται για λάθος.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90"
        >
          Επιστροφή στο Dashboard
        </Link>
      </div>
    </div>
  );
}
