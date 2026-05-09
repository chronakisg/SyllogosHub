"use client";

import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase/client";

export function ProfileLogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = getBrowserClient();
    await supabase.auth.signOut();
    router.push("/portal/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="rounded-md border border-border px-3 py-1 text-sm transition hover:bg-background"
    >
      Αποσύνδεση
    </button>
  );
}
