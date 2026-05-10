"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";

type MemberData = {
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  birth_date: string | null;
  address: string | null;
  occupation: string | null;
  father_name: string | null;
  mother_name: string | null;
  maiden_name: string | null;
  birthplace: string | null;
  residence: string | null;
};

type ClubData = {
  name: string;
  logo_url: string | null;
  primary_color: string;
};

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

export default function MeTokenPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [member, setMember] = useState<MemberData | null>(null);
  const [club, setClub] = useState<ClubData | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // Form state — controlled inputs
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [address, setAddress] = useState("");
  const [occupation, setOccupation] = useState("");
  const [fatherName, setFatherName] = useState("");
  const [motherName, setMotherName] = useState("");
  const [maidenName, setMaidenName] = useState("");
  const [birthplace, setBirthplace] = useState("");
  const [residence, setResidence] = useState("");

  // Fetch member by token
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/me/${token}`);
        if (!cancelled) {
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            setError(body.error ?? "Σφάλμα φόρτωσης");
            setLoading(false);
            return;
          }
          const data = await res.json();
          setMember(data.member);
          setClub(data.club);
          // Pre-fill form με existing values
          setPhone(data.member.phone ?? "");
          setBirthDate(data.member.birth_date ?? "");
          setAddress(data.member.address ?? "");
          setOccupation(data.member.occupation ?? "");
          setFatherName(data.member.father_name ?? "");
          setMotherName(data.member.mother_name ?? "");
          setMaidenName(data.member.maiden_name ?? "");
          setBirthplace(data.member.birthplace ?? "");
          setResidence(data.member.residence ?? "");
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError("Σφάλμα δικτύου");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit() {
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/me/${token}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: phone.trim() || null,
          birth_date: birthDate || null,
          address: address.trim() || null,
          occupation: occupation.trim() || null,
          father_name: fatherName.trim() || null,
          mother_name: motherName.trim() || null,
          maiden_name: maidenName.trim() || null,
          birthplace: birthplace.trim() || null,
          residence: residence.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Σφάλμα αποθήκευσης");
        setSubmitting(false);
        return;
      }
      setSuccess(true);
      setSubmitting(false);
    } catch (e) {
      setError("Σφάλμα δικτύου");
      setSubmitting(false);
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted">Φόρτωση…</div>
      </div>
    );
  }

  // Error state (token invalid/expired)
  if (error && !member) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="max-w-md rounded-xl border border-border bg-surface p-6 text-center">
          <div className="mb-2 text-4xl">⚠️</div>
          <h1 className="mb-2 text-lg font-semibold">Σφάλμα</h1>
          <p className="text-sm text-muted">{error}</p>
        </div>
      </div>
    );
  }

  if (!member || !club) {
    return null;
  }

  const primary = club.primary_color || "#800000";

  // Success state
  if (success) {
    return (
      <div
        className="flex min-h-screen items-center justify-center p-4"
        style={{ backgroundColor: "#f5f5f5" }}
      >
        <div className="max-w-md rounded-xl border border-border bg-white p-8 text-center shadow-sm">
          <div className="mb-3 text-5xl">✅</div>
          <h1
            className="mb-2 text-xl font-semibold"
            style={{ color: primary }}
          >
            Ευχαριστούμε!
          </h1>
          <p className="text-sm text-muted">
            Τα στοιχεία σου ενημερώθηκαν με επιτυχία.
            <br />
            Μπορείς να κλείσεις αυτό το παράθυρο.
          </p>
        </div>
      </div>
    );
  }

  // Main form
  return (
    <div
      className="min-h-screen p-4"
      style={{ backgroundColor: "#f5f5f5" }}
    >
      <div className="mx-auto max-w-2xl">
        {/* Header με logo */}
        <div
          className="mb-4 rounded-xl bg-white p-6 text-center shadow-sm"
          style={{ borderTop: `4px solid ${primary}` }}
        >
          {club.logo_url ? (
            <img
              src={club.logo_url}
              alt={club.name}
              className="mx-auto mb-3 max-h-24"
            />
          ) : (
            <div
              className="mb-2 text-lg font-bold"
              style={{ color: primary }}
            >
              {club.name}
            </div>
          )}
          <h1 className="text-xl font-semibold">
            Καλώς ήρθες, {member.first_name}!
          </h1>
          <p className="mt-2 text-sm text-muted">
            Παρακαλούμε συμπλήρωσε ή επιβεβαίωσε τα στοιχεία σου.
          </p>
        </div>

        {/* Read-only info */}
        <div className="mb-4 rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-muted">
            Στοιχεία ταυτότητας (μη επεξεργάσιμα)
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <div className="text-xs text-muted">Όνομα</div>
              <div className="font-medium">{member.first_name}</div>
            </div>
            <div>
              <div className="text-xs text-muted">Επώνυμο</div>
              <div className="font-medium">{member.last_name}</div>
            </div>
            <div className="sm:col-span-2">
              <div className="text-xs text-muted">Email</div>
              <div className="font-medium">{member.email}</div>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted">
            Για αλλαγή των παραπάνω στοιχείων, επικοινώνησε με τη γραμματεία.
          </p>
        </div>

        {/* Editable form */}
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-muted">
            Στοιχεία προς συμπλήρωση
          </h2>

          <div className="space-y-4">
            <Field label="Τηλέφωνο">
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={inputClass}
              />
            </Field>

            <Field label="Ημερομηνία γέννησης">
              <input
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                className={inputClass}
              />
            </Field>

            <Field label="Τόπος γέννησης">
              <input
                type="text"
                value={birthplace}
                onChange={(e) => setBirthplace(e.target.value)}
                className={inputClass}
              />
            </Field>

            <Field label="Διεύθυνση (οδός, αριθμός)">
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className={inputClass}
              />
            </Field>

            <Field label="Τόπος κατοικίας">
              <input
                type="text"
                value={residence}
                onChange={(e) => setResidence(e.target.value)}
                className={inputClass}
              />
            </Field>

            <Field label="Επάγγελμα">
              <input
                type="text"
                value={occupation}
                onChange={(e) => setOccupation(e.target.value)}
                className={inputClass}
              />
            </Field>

            <Field label="Όνομα πατρός">
              <input
                type="text"
                value={fatherName}
                onChange={(e) => setFatherName(e.target.value)}
                className={inputClass}
              />
            </Field>

            <Field label="Όνομα μητρός">
              <input
                type="text"
                value={motherName}
                onChange={(e) => setMotherName(e.target.value)}
                className={inputClass}
              />
            </Field>

            <Field label="Γένος (πατρικό επώνυμο)">
              <input
                type="text"
                value={maidenName}
                onChange={(e) => setMaidenName(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>

          {error && (
            <div className="mt-4 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="mt-6 w-full rounded-lg px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: primary }}
          >
            {submitting ? "Αποθήκευση…" : "Αποθήκευση & Επιβεβαίωση"}
          </button>

          <p className="mt-3 text-center text-xs text-muted">
            Τα στοιχεία σου είναι ασφαλή και δεν μοιράζονται με τρίτους.
          </p>
        </div>
      </div>
    </div>
  );
}
