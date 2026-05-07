"use client";

import { useRouter } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase/client";

export function AdminHeader() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = getBrowserClient();
    await supabase.auth.signOut();
    router.push("/login?redirect=/admin/clubs");
  }

  return (
    <div className="bg-[#800000] text-white px-6 py-3 flex items-center justify-between">
      <span className="font-semibold">SyllogosHub — Super Admin</span>
      <div className="flex items-center gap-4">
        <span className="text-sm opacity-70">Διαχείριση Συλλόγων</span>
        <button
          onClick={handleLogout}
          className="text-sm bg-white/10 hover:bg-white/20 px-3 py-1 rounded transition-colors"
        >
          Αποσύνδεση
        </button>
      </div>
    </div>
  );
}
