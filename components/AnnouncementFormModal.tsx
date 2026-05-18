"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { Department } from "@/lib/supabase/types";

export type AnnouncementFormInitial = {
  id?: string;
  title: string;
  body: string;
  department_id: string | null;
  pinned: boolean;
  published: boolean;
};

export type AnnouncementFormValues = {
  title: string;
  body: string;
  department_id: string | null;
  pinned: boolean;
  published: boolean;
};

/**
 * Parent contract:
 * - Conditionally render the modal (`{state && <Modal .../>}`) to control mount/unmount.
 * - Provide `key={initial?.id ?? "create"}` to force a fresh mount when switching
 *   between create / edit / different edit targets — this resets form state
 *   without an in-effect setState dance.
 */
interface AnnouncementFormModalProps {
  mode: "create" | "edit";
  initial?: AnnouncementFormInitial;
  departments: Department[];
  isSaving: boolean;
  saveError: string | null;
  onClose: () => void;
  onSubmit: (values: AnnouncementFormValues) => Promise<void>;
}

const DEFAULT_VALUES: AnnouncementFormValues = {
  title: "",
  body: "",
  department_id: null,
  pinned: false,
  published: true,
};

export default function AnnouncementFormModal({
  mode,
  initial,
  departments,
  isSaving,
  saveError,
  onClose,
  onSubmit,
}: AnnouncementFormModalProps) {
  const titleId = useId();
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  // Lazy init από initial prop — read-once at mount. Parent forces remount
  // (μέσω key prop) όταν αλλάζει target, οπότε εδώ δεν χρειάζεται sync effect.
  const [title, setTitle] = useState<string>(
    () => initial?.title ?? DEFAULT_VALUES.title,
  );
  const [body, setBody] = useState<string>(
    () => initial?.body ?? DEFAULT_VALUES.body,
  );
  const [departmentId, setDepartmentId] = useState<string | null>(
    () => initial?.department_id ?? DEFAULT_VALUES.department_id,
  );
  const [pinned, setPinned] = useState<boolean>(
    () => initial?.pinned ?? DEFAULT_VALUES.pinned,
  );
  const [published, setPublished] = useState<boolean>(
    () => initial?.published ?? DEFAULT_VALUES.published,
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  // Autofocus (mount-once)
  useEffect(() => {
    const t = window.setTimeout(() => titleInputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, []);

  // Escape key
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !isSaving) {
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isSaving, onClose]);

  function validate(): string | null {
    if (title.trim().length < 1) return "Ο τίτλος είναι υποχρεωτικός.";
    if (body.trim().length < 1) return "Το κείμενο είναι υποχρεωτικό.";
    return null;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const err = validate();
    if (err) {
      setValidationError(err);
      return;
    }
    setValidationError(null);
    await onSubmit({
      title: title.trim(),
      body: body.trim(),
      department_id: departmentId,
      pinned,
      published,
    });
  }

  const displayError = validationError ?? saveError;
  const heading = mode === "create" ? "Νέα ανακοίνωση" : "Επεξεργασία ανακοίνωσης";
  const primaryLabel = mode === "create" ? "Δημιουργία" : "Αποθήκευση";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={() => {
        if (!isSaving) onClose();
      }}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
            <h2
              id={titleId}
              className="text-base font-semibold text-foreground"
            >
              {heading}
            </h2>
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              aria-label="Κλείσιμο"
              className="rounded-md p-1 text-muted hover:bg-muted/30 disabled:opacity-50"
            >
              ✕
            </button>
          </div>

          {/* Body */}
          <div className="space-y-4 px-5 py-4">
            <div>
              <label
                htmlFor="ann-title"
                className="mb-1 block text-sm font-medium text-foreground"
              >
                Τίτλος
              </label>
              <input
                ref={titleInputRef}
                id="ann-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={isSaving}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-foreground focus:outline-none disabled:opacity-60"
                placeholder="π.χ. Γενική Συνέλευση"
                maxLength={200}
              />
            </div>

            <div>
              <label
                htmlFor="ann-body"
                className="mb-1 block text-sm font-medium text-foreground"
              >
                Κείμενο
              </label>
              <textarea
                id="ann-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                disabled={isSaving}
                rows={6}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-foreground focus:outline-none disabled:opacity-60"
                placeholder="Το πλήρες κείμενο της ανακοίνωσης. Διατηρούνται τα κενά γραμμών."
              />
            </div>

            <div>
              <label
                htmlFor="ann-dept"
                className="mb-1 block text-sm font-medium text-foreground"
              >
                Αποδέκτες
              </label>
              <select
                id="ann-dept"
                value={departmentId ?? ""}
                onChange={(e) =>
                  setDepartmentId(e.target.value === "" ? null : e.target.value)
                }
                disabled={isSaving}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-foreground focus:outline-none disabled:opacity-60"
              >
                <option value="">Όλος ο σύλλογος</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={pinned}
                  onChange={(e) => setPinned(e.target.checked)}
                  disabled={isSaving}
                  className="h-4 w-4"
                />
                <span>📌 Καρφίτσωμα στην κορυφή</span>
              </label>

              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={published}
                  onChange={(e) => setPublished(e.target.checked)}
                  disabled={isSaving}
                  className="h-4 w-4"
                />
                <span>Δημοσιευμένη</span>
              </label>
            </div>

            {displayError && (
              <div
                role="alert"
                className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200"
              >
                {displayError}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-muted/30 disabled:opacity-50"
            >
              Ακύρωση
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-lg bg-[#800000] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#660000] disabled:opacity-60"
            >
              {isSaving && (
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              )}
              {isSaving ? "Αποθήκευση…" : primaryLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
