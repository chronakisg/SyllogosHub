import { requireSuperAdmin } from "@/lib/auth/requireSuperAdmin";
import { redirect } from "next/navigation";
import { logger } from "@/lib/utils/logger";
import { AdminHeader } from "./AdminHeader";

type AuthFailReason =
  | "auth_required"
  | "not_super_admin"
  | "db_error"
  | "unknown";

function statusToReason(status: number): AuthFailReason {
  if (status === 401) return "auth_required";
  if (status === 403) return "not_super_admin";
  if (status === 500) return "db_error";
  return "unknown";
}

function reasonToUrl(reason: AuthFailReason): string {
  if (reason === "auth_required") return "/login?redirect=/admin";
  return "/";
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requireSuperAdmin();
  } catch (err) {
    let reason: AuthFailReason = "unknown";
    let status: number | null = null;
    if (err instanceof Response) {
      status = err.status;
      reason = statusToReason(err.status);
    }
    logger.error("admin/layout", "Super admin auth failed", {
      reason,
      status,
      errorMessage: err instanceof Error ? err.message : null,
    });
    redirect(reasonToUrl(reason));
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminHeader />
      <main className="p-6">{children}</main>
    </div>
  );
}
