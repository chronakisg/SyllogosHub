import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/auth/portalAuth";

export default async function PortalHomePage() {
  // Belt-and-suspenders auth check — το layout ήδη κάνει redirect αν
  // !member, αλλά κρατάμε το guard στο page-level για cases όπου layout
  // execution ordering αλλάξει στο μέλλον (Next.js parallel layout/page).
  // Επιπλέον, μας δίνει το member object για το welcome message χωρίς
  // να χρειαστεί prop-drilling από το shell.
  const member = await getCurrentMember();
  if (!member) {
    redirect("/portal/login");
  }

  const firstName = member.first_name?.trim() ?? "";
  const greeting = firstName ? `Καλώς ήρθες, ${firstName}` : "Καλώς ήρθες";

  return (
    <div className="space-y-6">
      {/* Welcome card */}
      <section className="rounded-xl border border-border bg-background p-6">
        <h2 className="text-xl font-semibold text-foreground">{greeting}</h2>
        <p className="mt-2 text-sm text-muted">
          Αυτή είναι η προσωπική σου σελίδα στον σύλλογο. Από εδώ μπορείς να
          δεις τις εκκρεμότητές σου, το προφίλ σου, και τις επόμενες
          εκδηλώσεις.
        </p>
      </section>

      {/* Obligations placeholder — Phase 2 hook (Obligations unified view) */}
      <section className="rounded-xl border border-border bg-background p-6">
        <h3 className="text-base font-semibold text-foreground">
          Οι εκκρεμότητές μου
        </h3>
        <p className="mt-3 text-sm text-muted">
          Δεν υπάρχουν εκκρεμότητες αυτή τη στιγμή.
        </p>
        <p className="mt-2 text-xs text-muted">
          Σύντομα εδώ θα βλέπεις συνδρομές, κρατήσεις εκδηλώσεων, και
          εγγραφές σε τμήματα που χρειάζονται την προσοχή σου.
        </p>
      </section>

      {/* Quick links — Phase 1 set: profile + calendar */}
      <section className="rounded-xl border border-border bg-background p-6">
        <h3 className="text-base font-semibold text-foreground">
          Γρήγορες ενέργειες
        </h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Link
            href="/portal/profile"
            className="block rounded-lg border border-border bg-background p-4 transition hover:bg-muted/30"
          >
            <p className="text-sm font-medium text-foreground">
              Το προφίλ μου
            </p>
            <p className="mt-1 text-xs text-muted">
              Δες και ενημέρωσε τα στοιχεία σου
            </p>
          </Link>
          <Link
            href="/calendar"
            className="block rounded-lg border border-border bg-background p-4 transition hover:bg-muted/30"
          >
            <p className="text-sm font-medium text-foreground">
              Ημερολόγιο
            </p>
            <p className="mt-1 text-xs text-muted">
              Δες τις επερχόμενες εκδηλώσεις
            </p>
          </Link>
        </div>
      </section>
    </div>
  );
}
