import { requireSuperAdmin } from "@/lib/auth/requireSuperAdmin";
import { redirect } from "next/navigation";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requireSuperAdmin();
  } catch {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-[#800000] text-white px-6 py-3 flex items-center justify-between">
        <span className="font-semibold">SyllogosHub — Super Admin</span>
        <span className="text-sm opacity-70">Διαχείριση Συλλόγων</span>
      </div>
      <main className="p-6">{children}</main>
    </div>
  );
}
