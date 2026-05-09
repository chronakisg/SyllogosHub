import { redirect } from "next/navigation";
import { getServerClient } from "@/lib/supabase/server";
import { linkAuthUserToMember } from "@/lib/auth/portalAuth";

type SearchParams = { code?: string; error?: string };

export default async function AuthCallbackPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  if (params.error || !params.code) {
    redirect("/portal/login?error=link_failed");
  }

  const supabase = await getServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(
    params.code
  );

  if (error || !data.user?.email) {
    redirect("/portal/login?error=link_failed");
  }

  // Post-login linkage hook
  const member = await linkAuthUserToMember(data.user.id, data.user.email);

  if (!member) {
    redirect("/portal/login?error=member_not_found");
  }

  redirect("/portal/profile");
}
