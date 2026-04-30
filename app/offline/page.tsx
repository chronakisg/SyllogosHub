"use client";

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      <h1 className="text-2xl font-bold text-[#800000]">
        Δεν υπάρχει σύνδεση
      </h1>
      <p className="mt-3 text-gray-600">
        Είσαι offline. Έλεγξε τη σύνδεσή σου και προσπάθησε ξανά.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="mt-6 rounded-md bg-[#800000] px-4 py-2 text-white hover:opacity-90"
      >
        Επανάληψη
      </button>
    </div>
  );
}
