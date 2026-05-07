import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminClient } from "@/lib/supabase/admin";
import { ClubEditPanel } from "./ClubEditPanel";

const PLAN_BADGE: Record<string, string> = {
  basic: "bg-gray-200 text-gray-800",
  pro: "bg-blue-100 text-blue-800",
  premium: "bg-[#800000]/10 text-[#800000]",
};

const SITE_URL = "https://hub.party4u.gr";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("el-GR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default async function AdminClubDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getAdminClient();

  // A. Club info
  const { data: club, error: clubError } = await supabase
    .from("clubs")
    .select("id, name, slug, plan, is_active, created_at")
    .eq("id", id)
    .maybeSingle();
  if (clubError) throw clubError;
  if (!club) notFound();

  // B. Stats — 3 queries σε parallel
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const yearEnd = `${new Date().getFullYear()}-12-31`;

  const [membersRes, eventsRes, lastActivityRes] = await Promise.all([
    supabase
      .from("members")
      .select("*", { count: "exact", head: true })
      .eq("club_id", id),
    supabase
      .from("events")
      .select("*", { count: "exact", head: true })
      .eq("club_id", id)
      .gte("event_date", yearStart)
      .lte("event_date", yearEnd),
    supabase
      .from("members")
      .select("created_at")
      .eq("club_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (membersRes.error) throw membersRes.error;
  if (eventsRes.error) throw eventsRes.error;
  if (lastActivityRes.error) throw lastActivityRes.error;

  const memberCount = membersRes.count ?? 0;
  const eventCount = eventsRes.count ?? 0;
  const lastActivity = lastActivityRes.data?.created_at ?? null;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div>
        <Link
          href="/admin/clubs"
          className="text-[#800000] hover:underline text-sm"
        >
          ← Πίσω στους Συλλόγους
        </Link>

        <div className="mt-3 bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-start justify-between gap-4 mb-3">
            <h1 className="text-2xl font-semibold">{club.name}</h1>
            {club.is_active ? (
              <span className="px-3 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
                Ενεργός
              </span>
            ) : (
              <span className="px-3 py-1 rounded text-xs font-medium bg-red-100 text-red-800">
                Ανενεργός
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
            <span>
              slug:{" "}
              <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">
                {club.slug}
              </span>
            </span>
            <span className="text-gray-300">|</span>
            <span
              className={`px-2 py-1 rounded text-xs font-medium ${
                PLAN_BADGE[club.plan] ?? "bg-gray-100 text-gray-700"
              }`}
            >
              {club.plan}
            </span>
          </div>

          <div className="mt-2 text-sm text-gray-500">
            Ενεργός από: {formatDate(club.created_at)}
          </div>

          <div className="mt-4">
            <a
              href={SITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-[#800000] text-white px-4 py-2 rounded text-sm font-medium hover:opacity-90"
            >
              🔗 Άνοιξε το Site
            </a>
          </div>
        </div>
      </div>

      {/* ── Stats cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard icon="👥" label="Μέλη" value={String(memberCount)} />
        <StatCard
          icon="🎪"
          label="Εκδηλώσεις φέτος"
          value={String(eventCount)}
        />
        <StatCard
          icon="📅"
          label="Τελευταία Δραστηριότητα"
          value={formatDate(lastActivity)}
        />
      </div>

      {/* ── Plan & Status (editable) ── */}
      <ClubEditPanel club={club} />

      {/* ── Quick Actions ── */}
      <Section title="Quick Actions">
        <p className="text-xs text-gray-500 mb-3">
          Το app διαβάζει το τρέχον club από session/cookie, οπότε ο admin
          πρέπει να είναι ήδη συνδεδεμένος.
        </p>
        <a
          href={SITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-[#800000] text-white px-4 py-2 rounded text-sm font-medium hover:opacity-90"
        >
          🔗 Άνοιξε το Site του Συλλόγου
        </a>
      </Section>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="text-xs text-gray-500 mb-1">
        <span className="mr-1">{icon}</span>
        {label}
      </div>
      <div className="text-2xl font-semibold text-gray-900">{value}</div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-4">
        {title}
      </h2>
      {children}
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-600">{label}</span>
      <span className="text-sm">{children}</span>
    </div>
  );
}
