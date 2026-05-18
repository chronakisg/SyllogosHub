"use client";

import { useEffect, useId, useRef } from "react";

interface ConfirmDeleteAnnouncementModalProps {
  /**
   * Title της ανακοίνωσης που θα διαγραφεί — εμφανίζεται στο body.
   */
  announcementTitle: string;
  isDeleting: boolean;
  deleteError: string | null;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

const MAROON = "#800000";

/**
 * Confirm dialog για hard delete ανακοίνωσης.
 *
 * Mount-once pattern: parent kontrolerer τη χρήση με
 *   {deleteTarget && <Modal key={deleteTarget.id} ... />}
 * Cancel button autofocused — safer default για destructive action.
 */
export default function ConfirmDeleteAnnouncementModal({
  announcementTitle,
  isDeleting,
  deleteError,
  onClose,
  onConfirm,
}: ConfirmDeleteAnnouncementModalProps) {
  const titleId = useId();
  const descId = useId();
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  // Autofocus στο Cancel button (safer default)
  useEffect(() => {
    const t = window.setTimeout(() => cancelRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, []);

  // Escape key — closes (το cancel-equivalent)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !isDeleting) {
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isDeleting, onClose]);

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
        {/* Header — maroon for danger affordance */}
        <div
          className="flex items-center justify-between gap-3 border-b px-5 py-3"
          style={{ borderColor: MAROON }}
        >
          <h2
            id={titleId}
            className="text-base font-semibold"
            style={{ color: MAROON }}
          >
            <span aria-hidden="true">⚠️ </span>
            Διαγραφή ανακοίνωσης
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            aria-label="Κλείσιμο"
            className="rounded-md p-1 text-muted hover:bg-muted/30 disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div id={descId} className="space-y-3 px-5 py-4 text-sm text-foreground">
          <p>
            Πρόκειται να διαγραφεί η ανακοίνωση:
          </p>
          <p className="rounded-lg border border-border bg-muted/20 px-3 py-2 font-medium">
            «{announcementTitle}»
          </p>
          <p className="text-muted">
            Αυτή η ενέργεια δεν αναιρείται.
          </p>

          {deleteError && (
            <div
              role="alert"
              className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-red-800 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200"
            >
              {deleteError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="rounded-lg px-3 py-1.5 text-sm text-foreground hover:bg-muted/30 disabled:opacity-50"
          >
            Ακύρωση
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60"
            style={{ backgroundColor: MAROON }}
          >
            {isDeleting ? (
              <>
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Διαγραφή…
              </>
            ) : (
              <>
                <span aria-hidden="true">🗑️</span>
                Διαγραφή
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
