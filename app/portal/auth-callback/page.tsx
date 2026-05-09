import { redirect } from "next/navigation";
import { getServerClient } from "@/lib/supabase/server";
import { linkAuthUserToMember } from "@/lib/auth/portalAuth";

type SearchParams = {
  token_hash?: string;
  type?: string;
  error?: string;
};

export default async function AuthCallbackPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  if (params.error || !params.token_hash || params.type !== "magiclink") {
    redirect("/portal/login?error=link_failed");
  }

  const supabase = await getServerClient();
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: params.token_hash,
    type: "magiclink",
  });

  if (error || !data.user?.email || !data.user?.id) {
    console.error("verifyOtp failed:", error);
    redirect("/portal/login?error=link_failed");
  }

  const member = await linkAuthUserToMember(data.user.id, data.user.email);

  if (!member) {
    redirect("/portal/login?error=member_not_found");
  }

  redirect("/portal/profile");
}
