"use client";

import { useEffect, useId, useRef } from "react";

interface ConfirmDeleteReservationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  reservation: {
    group_name: string;
    pax_count: number;
    table_number: number | null;
  };
  isDeleting: boolean;
}

const MAROON = "#800000";

export function ConfirmDeleteReservationModal({
  isOpen,
  onClose,
  onConfirm,
  reservation,
  isDeleting,
}: ConfirmDeleteReservationModalProps) {
  const titleId = useId();
  const descId = useId();
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      cancelRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !isDeleting) {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, isDeleting, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      onClick={() => {
        if (!isDeleting) onClose();
      }}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between gap-3 border-b-2 px-5 py-3"
          style={{ borderColor: MAROON, color: MAROON }}
        >
          <h2 id={titleId} className="flex items-center gap-2 text-base font-semibold">
            <span aria-hidden>⚠️</span>
            Διαγραφή παρέας
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="rounded p-1 text-muted transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Κλείσιμο"
          >
            ✕
          </button>
        </div>

        <div id={descId} className="space-y-3 px-5 py-4 text-sm">
          <p>
            Πρόκειται να διαγράψεις την παρέα{" "}
            <span className="font-semibold">«{reservation.group_name}»</span>{" "}
            μαζί με τα{" "}
            <span className="font-semibold">
              {reservation.pax_count}{" "}
              {reservation.pax_count === 1 ? "άτομό" : "άτομά"}
            </span>{" "}
            της.
          </p>

          {reservation.table_number != null && (
            <p
              className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
            >
              <span aria-hidden>⚠️ </span>
              Αυτή η παρέα είναι στο{" "}
              <span className="font-semibold">
                Τραπέζι Νο {reservation.table_number}
              </span>
              . Το τραπέζι θα γίνει διαθέσιμο.
            </p>
          )}

          <p className="text-muted">
            Αυτή η ενέργεια <strong>δεν αναιρείται</strong>.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="rounded-md border border-border bg-white px-4 py-1.5 text-sm transition hover:bg-background disabled:cursor-not-allowed disabled:opacity-50 dark:bg-transparent"
          >
            Ακύρωση
          </button>
          <button
            type="button"
            onClick={() => {
              if (!isDeleting) void onConfirm();
            }}
            disabled={isDeleting}
            className="inline-flex items-center gap-2 rounded-md px-4 py-1.5 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: MAROON }}
          >
            {isDeleting ? (
              <>
                <span
                  className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white"
                  aria-hidden
                />
                Διαγραφή…
              </>
            ) : (
              <>
                <span aria-hidden>🗑️</span>
                Διαγραφή
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
