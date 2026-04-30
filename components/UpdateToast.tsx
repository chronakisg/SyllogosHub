"use client";

import { useServiceWorkerUpdate } from "@/hooks/useServiceWorkerUpdate";

export function UpdateToast() {
  const { updateAvailable, applyUpdate } = useServiceWorkerUpdate();

  if (!updateAvailable) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 transform rounded-lg bg-[#800000] px-4 py-3 text-white shadow-lg flex items-center gap-3"
    >
      <span>Νέα έκδοση διαθέσιμη</span>
      <button
        onClick={applyUpdate}
        className="rounded bg-white px-3 py-1 text-sm font-medium text-[#800000] hover:bg-gray-100"
      >
        Refresh
      </button>
    </div>
  );
}
