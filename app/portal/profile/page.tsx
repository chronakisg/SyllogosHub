import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { getCurrentMember } from "@/lib/auth/portalAuth";
import type { Database } from "@/lib/supabase/types";
import { ProfileEditForm } from "./ProfileEditForm";
import { ProfileLogoutButton } from "./ProfileLogoutButton";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Missing Supabase env vars");
  }
  return createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const FAMILY_ROLE_LABELS: Record<string, string> = {
  parent: "Γονέας",
  child: "Παιδί",
};

export default async function ProfilePage() {
  const member = await getCurrentMember();
  if (!member) {
    redirect("/portal/login");
  }

  // Load club name + branding for header
  let clubName = "Σύλλογος";
  let logoUrl: string | null = null;
  let primaryColor = "#800000";

  if (member.club_id) {
    const admin = getServiceClient();
    const [clubResult, settingsResult] = await Promise.all([
      admin.from("clubs").select("name").eq("id", member.club_id).maybeSingle(),
      admin
        .from("club_settings")
        .select("logo_url, primary_color")
        .eq("club_id", member.club_id)
        .maybeSingle(),
    ]);
    clubName = clubResult.data?.name ?? clubName;
    logoUrl = settingsResult.data?.logo_url ?? null;
    primaryColor = settingsResult.data?.primary_color ?? primaryColor;
  }

  const fullName = `${member.first_name} ${member.last_name}`.trim();
  const memberSince = member.created_at
    ? new Date(member.created_at).toLocaleDateString("el-GR", {
        year: "numeric",
        month: "long",
      })
    : null;
  const familyRoleLabel = member.family_role
    ? FAMILY_ROLE_LABELS[member.family_role] ?? member.family_role
    : null;

  return (
    <main className="mx-auto w-full max-w-2xl p-6">
      {/* Header */}
      <header
        className="mb-6 flex items-center justify-between rounded-xl border border-border bg-surface p-4"
        style={{ borderTopWidth: 4, borderTopColor: primaryColor }}
      >
        <div className="flex items-center gap-3">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={clubName}
              className="h-10 w-10 rounded-lg object-contain"
            />
          ) : (
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-semibold text-white"
              style={{ backgroundColor: primaryColor }}
            >
              Σ
            </div>
          )}
          <div>
            <h1 className="text-base font-semibold tracking-tight">
              {clubName}
            </h1>
            <p className="text-xs text-muted">Το προφίλ μου</p>
          </div>
        </div>
        <ProfileLogoutButton />
      </header>

      {/* Read-only identity */}
      <section className="mb-6 rounded-xl border border-border bg-surface p-6">
        <h2 className="mb-3 text-lg font-semibold">{fullName}</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted">Email</dt>
            <dd>{member.email ?? "—"}</dd>
          </div>
          {member.registry_number && (
            <div>
              <dt className="text-xs text-muted">Αριθμός Μητρώου</dt>
              <dd>{member.registry_number}</dd>
            </div>
          )}
          {memberSince && (
            <div>
              <dt className="text-xs text-muted">Μέλος από</dt>
              <dd>{memberSince}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-muted">Κατάσταση</dt>
            <dd>{member.status === "active" ? "Ενεργό" : "Ανενεργό"}</dd>
          </div>
          {familyRoleLabel && (
            <div>
              <dt className="text-xs text-muted">Ρόλος οικογένειας</dt>
              <dd>{familyRoleLabel}</dd>
            </div>
          )}
        </dl>
      </section>

      {/* Edit form */}
      <section className="rounded-xl border border-border bg-surface p-6">
        <h2 className="mb-4 text-lg font-semibold">Στοιχεία επικοινωνίας</h2>
        <ProfileEditForm
          initialData={{
            phone: member.phone,
            birth_date: member.birth_date,
            birthplace: member.birthplace,
            residence: member.residence,
            address: member.address,
            occupation: member.occupation,
            father_name: member.father_name,
            mother_name: member.mother_name,
            maiden_name: member.maiden_name,
          }}
        />
      </section>
    </main>
  );
}
