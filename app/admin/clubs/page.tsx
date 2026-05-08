import Link from "next/link";
import { getAdminClient } from "@/lib/supabase/admin";
import { CLUB_CATEGORY_LABELS } from "@/lib/supabase/types";
import type { ClubCategory } from "@/lib/supabase/types";

const PLAN_BADGE: Record<string, string> = {
  basic: "bg-gray-200 text-gray-800",
  pro: "bg-blue-100 text-blue-800",
  premium: "bg-[#800000]/10 text-[#800000]",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("el-GR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default async function AdminClubsPage({
  searchParams,
}: {
  searchParams: Promise<{
    created?: string;
    deleted?: string;
    category?: string;
  }>;
}) {
  const { created, deleted, category } = await searchParams;

  const supabase = getAdminClient();
  let query = supabase
    .from("clubs")
    .select("id, name, slug, plan, is_active, created_at, category")
    .order("created_at", { ascending: false });

  if (category && category in CLUB_CATEGORY_LABELS) {
    query = query.eq("category", category as ClubCategory);
  }

  const { data: clubs, error } = await query;

  if (error) throw error;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Σύλλογοι</h1>
        <Link
          href="/admin/clubs/new"
          className="bg-[#800000] text-white px-4 py-2 rounded text-sm font-medium hover:opacity-90"
        >
          + Νέος Σύλλογος
        </Link>
      </div>

      {created === "1" && (
        <div className="mb-4 rounded bg-green-50 border border-green-200 px-4 py-3 text-green-800 text-sm">
          Ο σύλλογος δημιουργήθηκε επιτυχώς.
        </div>
      )}

      {deleted === "1" && (
        <div className="mb-4 rounded bg-red-50 border border-red-200 px-4 py-3 text-red-800 text-sm">
          Ο σύλλογος διαγράφηκε οριστικά.
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-gray-600 mr-1">Φίλτρο κατηγορίας:</span>
        <FilterLink
          href="/admin/clubs"
          label="Όλες"
          active={!category || !(category in CLUB_CATEGORY_LABELS)}
        />
        {Object.entries(CLUB_CATEGORY_LABELS).map(([value, label]) => (
          <FilterLink
            key={value}
            href={`/admin/clubs?category=${value}`}
            label={label}
            active={category === value}
          />
        ))}
      </div>

      {!clubs || clubs.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center text-gray-500">
          Δεν υπάρχουν σύλλογοι
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Όνομα</th>
                <th className="text-left px-4 py-3 font-medium">Slug</th>
                <th className="text-left px-4 py-3 font-medium">Κατηγορία</th>
                <th className="text-left px-4 py-3 font-medium">Πλάνο</th>
                <th className="text-left px-4 py-3 font-medium">Κατάσταση</th>
                <th className="text-left px-4 py-3 font-medium">
                  Δημιουργήθηκε
                </th>
              </tr>
            </thead>
            <tbody>
              {clubs.map((club) => (
                <tr
                  key={club.id}
                  className="border-t border-gray-100 hover:bg-gray-50"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/clubs/${club.id}`}
                      className="text-[#800000] hover:underline font-medium"
                    >
                      {club.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                    {club.slug}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 rounded text-xs bg-gray-100 text-gray-700">
                      {CLUB_CATEGORY_LABELS[club.category]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        PLAN_BADGE[club.plan] ?? "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {club.plan}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {club.is_active ? (
                      <span className="px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
                        Ενεργός
                      </span>
                    ) : (
                      <span className="px-2 py-1 rounded text-xs font-medium bg-red-100 text-red-800">
                        Ανενεργός
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {formatDate(club.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilterLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`px-3 py-1 rounded transition-colors ${
        active
          ? "bg-[#800000] text-white font-medium"
          : "text-gray-700 hover:bg-gray-100"
      }`}
    >
      {label}
    </Link>
  );
}
