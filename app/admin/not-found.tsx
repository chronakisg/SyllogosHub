import Link from "next/link";

export default function AdminNotFound() {
  return (
    <div className="max-w-md mx-auto mt-12">
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
        <div className="text-5xl mb-4" aria-hidden="true">
          🔍
        </div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">
          Δεν βρέθηκε η σελίδα
        </h1>
        <p className="text-sm text-gray-600 mb-6">
          Ο σύνδεσμος μπορεί να είναι λάθος ή ο σύλλογος να έχει διαγραφεί.
        </p>
        <Link
          href="/admin/clubs"
          className="inline-flex items-center gap-2 bg-[#800000] text-white px-4 py-2 rounded text-sm font-medium hover:opacity-90"
        >
          ← Επιστροφή στη Διαχείριση Συλλόγων
        </Link>
      </div>
    </div>
  );
}
