"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";

interface AddReservationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: {
    group_name: string;
    pax_count: number;
    event_id: string;
    club_id: string;
  }) => Promise<void>;
  eventId: string;
  clubId: string;
}

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

export function AddReservationModal({
  isOpen,
  onClose,
  onSubmit,
  eventId,
  clubId,
}: AddReservationModalProps) {
  const titleId = useId();
  const firstFieldRef = useRef<HTMLInputElement | null>(null);
  const [groupName, setGroupName] = useState("");
  const [pax, setPax] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setGroupName("");
      setPax("");
      setErr(null);
      setSaving(false);
      firstFieldRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !saving) {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, saving, onClose]);

  if (!isOpen) return null;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const g = groupName.trim();
    if (!g) {
      setErr("Το όνομα παρέας είναι υποχρεωτικό.");
      return;
    }
    if (!pax.trim()) {
      setErr("Ο αριθμός ατόμων είναι υποχρεωτικός.");
      return;
    }
    const p = Number(pax);
    if (!Number.isInteger(p) || p < 1 || p > 99) {
      setErr("Ο αριθμός ατόμων πρέπει να είναι από 1 έως 99.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await onSubmit({
        group_name: g,
        pax_count: p,
        event_id: eventId,
        club_id: clubId,
      });
    } catch (submitErr) {
      setErr(
        submitErr instanceof Error
          ? submitErr.message
          : "Σφάλμα αποθήκευσης."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="mb-4 text-lg font-semibold">
          Νέα Παρέα
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">
              Όνομα παρέας<span className="text-danger"> *</span>
            </span>
            <input
              ref={firstFieldRef}
              type="text"
              required
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="π.χ. Παρέα Κώστα"
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">
              Αριθμός ατόμων<span className="text-danger"> *</span>
            </span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              required
              value={pax}
              onChange={(e) =>
                setPax(e.target.value.replace(/[^0-9]/g, ""))
              }
              placeholder="π.χ. 8"
              className={inputClass}
            />
          </label>
          {err && (
            <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
              {err}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-border px-4 py-2 text-sm transition hover:bg-background disabled:opacity-50"
            >
              Ακύρωση
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Αποθήκευση…" : "Προσθήκη"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
