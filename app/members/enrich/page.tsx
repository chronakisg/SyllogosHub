"use client";

// app/members/enrich/page.tsx
//
// Wizard shell για το Member Enrichment flow. Coordinates 4 steps
// μέσω useReducer + step-specific child components. Permission gate
// mirrors το /members page pattern (line 1098-1107).
//
// Commit 4a: Upload + Mapping wired. Review + Summary είναι stubs.

import { useReducer } from "react";
import { useRouter } from "next/navigation";

import { AccessDenied } from "@/lib/auth/AccessDenied";
import { useRole } from "@/lib/hooks/useRole";

import { INITIAL_STATE, reducer } from "./_state";
import { MappingStep } from "./MappingStep";
import { UploadStep } from "./UploadStep";

export default function MemberEnrichWizardPage() {
  const role = useRole();
  const router = useRouter();
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  if (role.loading) {
    return <p className="p-6 text-sm text-muted">Φόρτωση…</p>;
  }
  if (role.userId && !role.permissions.includes("members")) {
    return <AccessDenied />;
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => router.push("/members")}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm transition hover:bg-background"
        >
          ← Λίστα μελών
        </button>
        <h1 className="text-lg font-semibold tracking-tight">
          Ενημέρωση μελών από Excel
        </h1>
      </header>

      {state.step === "upload" && <UploadStep dispatch={dispatch} />}

      {state.step === "mapping" && (
        <MappingStep state={state} dispatch={dispatch} />
      )}

      {state.step === "review" && (
        <div className="rounded-lg border border-border bg-surface p-6 text-sm">
          <p className="text-muted">
            Review step — coming in Commit 4b.
          </p>
          <button
            type="button"
            onClick={() => dispatch({ type: "RESET" })}
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm transition hover:bg-background"
          >
            ← Επιστροφή
          </button>
        </div>
      )}

      {state.step === "summary" && (
        <div className="rounded-lg border border-border bg-surface p-6 text-sm">
          <p className="text-muted">
            Summary step — coming in Commit 4b.
          </p>
          <button
            type="button"
            onClick={() => dispatch({ type: "RESET" })}
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm transition hover:bg-background"
          >
            ← Επιστροφή
          </button>
        </div>
      )}
    </div>
  );
}
