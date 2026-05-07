import { requireSuperAdmin } from "@/lib/auth/requireSuperAdmin";
import { redirect } from "next/navigation";
import { AdminHeader } from "./AdminHeader";

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
      <AdminHeader />
      <main className="p-6">{children}</main>
    </div>
  );
}
