import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/auth/portalAuth";
import { getAdminClient } from "@/lib/supabase/admin";
import { PortalShell } from "./PortalShell";

export default async function MemberPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const member = await getCurrentMember();
  if (!member) {
    redirect("/portal/login");
  }

  // Branding fetch — mirror του guard pattern από app/portal/(member)/profile/page.tsx
  // (skip αν orphaned member χωρίς club_id). Service-role client (getAdminClient)
  // bypass RLS — branding είναι read-only club-wide data.
  let branding = {
    clubName: "",
    logoUrl: null as string | null,
    primaryColor: "#800000",
  };

  if (member.club_id) {
    const admin = getAdminClient();
    const [clubRes, settingsRes] = await Promise.all([
      admin.from("clubs").select("name").eq("id", member.club_id).maybeSingle(),
      admin
        .from("club_settings")
        .select("logo_url, primary_color")
        .eq("club_id", member.club_id)
        .maybeSingle(),
    ]);

    branding = {
      clubName: clubRes.data?.name ?? "",
      logoUrl: settingsRes.data?.logo_url ?? null,
      primaryColor: settingsRes.data?.primary_color ?? "#800000",
    };
  }

  return (
    <PortalShell member={member} branding={branding}>
      {children}
    </PortalShell>
  );
}
