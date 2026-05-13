"use client";

import Link from "next/link";
import { useEffect } from "react";
import { logger } from "@/lib/utils/logger";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("admin/error", "Uncaught admin page error", {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  const showDetails = process.env.NODE_ENV !== "production";

  return (
    <div className="max-w-md mx-auto mt-12">
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
        <div className="text-5xl mb-4" aria-hidden="true">
          ⚠️
        </div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">
          Κάτι πήγε στραβά
        </h1>
        <p className="text-sm text-gray-600 mb-6">
          Παρουσιάστηκε σφάλμα κατά την επεξεργασία.
        </p>

        {showDetails && (
          <pre className="mb-6 text-left text-xs bg-gray-50 border border-gray-200 rounded p-3 overflow-auto max-h-48 text-gray-700 whitespace-pre-wrap">
            {error.message}
            {error.digest ? `\n\ndigest: ${error.digest}` : ""}
          </pre>
        )}

        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="bg-[#800000] text-white px-4 py-2 rounded text-sm font-medium hover:opacity-90"
          >
            Δοκίμασε ξανά
          </button>
          <Link
            href="/admin/clubs"
            className="text-[#800000] hover:underline text-sm"
          >
            Επιστροφή στη Διαχείριση Συλλόγων
          </Link>
        </div>
      </div>
    </div>
  );
}
