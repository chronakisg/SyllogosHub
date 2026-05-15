import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/auth/portalAuth";
import { ProfileEditForm } from "./ProfileEditForm";
import {
  FAMILY_ROLE_LABELS,
  type FamilyRole,
  type MemberStatus,
} from "@/lib/supabase/types";

const STATUS_LABELS: Record<MemberStatus, string> = {
  active: "Ενεργό",
  inactive: "Ανενεργό",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("el-GR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

export default async function ProfilePage() {
  // Belt-and-suspenders auth check — layout κάνει ήδη redirect,
  // αλλά κρατάμε το guard στο page-level (ίδιο pattern με /portal home).
  const member = await getCurrentMember();
  if (!member) {
    redirect("/portal/login");
  }

  const familyRoleLabel = member.family_role
    ? FAMILY_ROLE_LABELS[member.family_role as FamilyRole]
    : null;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-background p-6">
        <h2 className="text-xl font-semibold text-foreground">
          Τα στοιχεία μου
        </h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase text-muted">
              Email
            </dt>
            <dd className="mt-1 text-sm text-foreground">
              {member.email ?? "—"}
            </dd>
          </div>
          {member.registry_number && (
            <div>
              <dt className="text-xs font-medium uppercase text-muted">
                Αριθμός Μητρώου
              </dt>
              <dd className="mt-1 text-sm text-foreground">
                {member.registry_number}
              </dd>
            </div>
          )}
          {member.created_at && (
            <div>
              <dt className="text-xs font-medium uppercase text-muted">
                Μέλος από
              </dt>
              <dd className="mt-1 text-sm text-foreground">
                {formatDate(member.created_at)}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-xs font-medium uppercase text-muted">
              Κατάσταση
            </dt>
            <dd className="mt-1 text-sm text-foreground">
              {STATUS_LABELS[member.status as MemberStatus] ?? "—"}
            </dd>
          </div>
          {familyRoleLabel && (
            <div>
              <dt className="text-xs font-medium uppercase text-muted">
                Ρόλος οικογένειας
              </dt>
              <dd className="mt-1 text-sm text-foreground">
                {familyRoleLabel}
              </dd>
            </div>
          )}
        </dl>
      </section>

      <section className="rounded-xl border border-border bg-background p-6">
        <h3 className="text-base font-semibold text-foreground">
          Στοιχεία επικοινωνίας
        </h3>
        <div className="mt-4">
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
        </div>
      </section>
    </div>
  );
}
