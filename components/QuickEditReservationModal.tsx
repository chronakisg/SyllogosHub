"use client";

import { useEffect, useId, useRef, useState } from "react";

interface QuickEditReservationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (groupName: string) => Promise<void>;
  currentGroupName: string;
  isSaving: boolean;
  saveError: string | null;
}

export function QuickEditReservationModal({
  isOpen,
  onClose,
  onConfirm,
  currentGroupName,
  isSaving,
  saveError,
}: QuickEditReservationModalProps) {
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const [groupName, setGroupName] = useState(currentGroupName);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setGroupName(currentGroupName);
      setValidationError(null);
    }
  }, [isOpen, currentGroupName]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !isSaving) {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, isSaving, onClose]);

  if (!isOpen) return null;

  function validate(): string | null {
    if (groupName.trim() === "")
      return "Το όνομα δεν μπορεί να είναι κενό.";
    return null;
  }

  async function handleSubmit() {
    const err = validate();
    if (err) {
      setValidationError(err);
      return;
    }
    setValidationError(null);
    await onConfirm(groupName.trim());
  }

  const displayError = validationError ?? saveError;

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
        className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
          <h2 id={titleId} className="text-base font-semibold">
            Μετονομασία Παρέας
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="rounded p-1 text-muted transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Κλείσιμο"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div>
            <label className="mb-1 block text-sm font-medium">
              Όνομα παρέας
            </label>
            <input
              ref={inputRef}
              type="text"
              value={groupName}
              onChange={(e) => {
                setGroupName(e.target.value);
                setValidationError(null);
              }}
              disabled={isSaving}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          {displayError && (
            <div className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              {displayError}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="rounded-md border border-border bg-white px-4 py-1.5 text-sm transition hover:bg-background disabled:cursor-not-allowed disabled:opacity-50 dark:bg-transparent"
          >
            Ακύρωση
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={isSaving || !!validate()}
            className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? (
              <>
                <span
                  className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white"
                  aria-hidden
                />
                Αποθήκευση…
              </>
            ) : (
              "Αποθήκευση"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
