"use client";

import Link from "next/link";
import {
  useEffect,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { errorMessage, getBrowserClient } from "@/lib/supabase/client";
import { useRole } from "@/lib/hooks/useRole";
import { useCurrentClub } from "@/lib/hooks/useCurrentClub";
import { AccessDenied } from "@/lib/auth/AccessDenied";
import {
  refreshClubSettings,
  useClubSettings,
} from "@/lib/hooks/useClubSettings";
import type {
  ClubSettings,
  ClubSettingsInsert,
  ClubSettingsUpdate,
} from "@/lib/supabase/types";

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

type FormState = {
  name: string;
  foundation_year: string;
  afm: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  facebook_url: string;
  instagram_url: string;
};

function fromSettings(s: ClubSettings | null, name: string): FormState {
  return {
    name,
    foundation_year:
      s?.foundation_year != null ? String(s.foundation_year) : "",
    afm: s?.afm ?? "",
    address: s?.address ?? "",
    phone: s?.phone ?? "",
    email: s?.email ?? "",
    website: s?.website ?? "",
    facebook_url: s?.facebook_url ?? "",
    instagram_url: s?.instagram_url ?? "",
  };
}

export default function ClubInfoPage() {
  const role = useRole();
  const { settings, clubName, loading: clubLoading } = useClubSettings();
  const { clubId } = useCurrentClub();
  const [form, setForm] = useState<FormState>(fromSettings(null, ""));
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const isPrivileged = role.isSystemAdmin || role.isPresident;

  useEffect(() => {
    if (!hydrated && !clubLoading) {
      setForm(fromSettings(settings.id ? settings : null, clubName));
      setHydrated(true);
    }
  }, [settings, clubName, clubLoading, hydrated]);

  function bind<K extends keyof FormState>(key: K) {
    return (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((s) => ({ ...s, [key]: e.target.value }));
  }

  async function handleSave() {
    setError(null);
    setInfo(null);
    const name = form.name.trim();
    if (!name) {
      setError("Το όνομα συλλόγου είναι υποχρεωτικό.");
      return;
    }
    if (!clubId) {
      setError("Δεν έχει εντοπιστεί σύλλογος.");
      return;
    }
    let foundationYear: number | null = null;
    if (form.foundation_year.trim()) {
      const y = Number(form.foundation_year);
      if (!Number.isInteger(y) || y < 1800 || y > 2100) {
        setError("Το έτος ίδρυσης δεν είναι έγκυρο.");
        return;
      }
      foundationYear = y;
    }
    setSaving(true);
    try {
      const supabase = getBrowserClient();
      const payload = {
        foundation_year: foundationYear,
        afm: form.afm.trim() || null,
        address: form.address.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        website: form.website.trim() || null,
        facebook_url: form.facebook_url.trim() || null,
        instagram_url: form.instagram_url.trim() || null,
        updated_at: new Date().toISOString(),
      } satisfies ClubSettingsUpdate;

      const { error: nameErr } = await supabase
        .from("clubs")
        .update({ name })
        .eq("id", clubId);
      if (nameErr) throw nameErr;

      if (settings.id) {
        const { error: uErr } = await supabase
          .from("club_settings")
          .update(payload)
          .eq("id", settings.id);
        if (uErr) throw uErr;
      } else {
        const insert: ClubSettingsInsert = { ...payload, club_id: clubId };
        const { error: iErr } = await supabase
          .from("club_settings")
          .insert(insert);
        if (iErr) throw iErr;
      }
      await refreshClubSettings();
      setInfo("Τα στοιχεία αποθηκεύτηκαν.");
    } catch (err) {
      setError(errorMessage(err, "Σφάλμα αποθήκευσης ρυθμίσεων."));
    } finally {
      setSaving(false);
    }
  }

  if (role.loading || clubLoading) {
    return (
      <div className="mx-auto w-full max-w-4xl p-10 text-center text-muted">
        Φόρτωση…
      </div>
    );
  }
  if (role.userId && !isPrivileged) {
    return <AccessDenied />;
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <Link
        href="/settings"
        className="mb-2 inline-flex items-center gap-1 text-sm text-muted transition hover:text-foreground"
      >
        ← Ρυθμίσεις
      </Link>
      <header className="mb-6">
        <p className="text-sm text-muted">Ρυθμίσεις › Στοιχεία Συλλόγου</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          Στοιχεία Συλλόγου
        </h1>
        <p className="mt-1 text-sm text-muted">
          Όνομα, ΑΦΜ, διεύθυνση και στοιχεία επικοινωνίας.
        </p>
      </header>

      {error && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}
      {info && (
        <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
          {info}
        </div>
      )}

      <section className="rounded-xl border border-border bg-surface p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Όνομα Συλλόγου" required>
            <input
              type="text"
              required
              value={form.name}
              onChange={bind("name")}
              className={inputClass}
            />
          </Field>
          <Field label="Έτος Ίδρυσης">
            <input
              type="number"
              inputMode="numeric"
              value={form.foundation_year}
              onChange={bind("foundation_year")}
              placeholder="π.χ. 1985"
              className={inputClass}
            />
          </Field>
          <Field label="ΑΦΜ">
            <input
              type="text"
              value={form.afm}
              onChange={bind("afm")}
              className={inputClass}
            />
          </Field>
          <Field label="Τηλέφωνο">
            <input
              type="tel"
              value={form.phone}
              onChange={bind("phone")}
              className={inputClass}
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={form.email}
              onChange={bind("email")}
              className={inputClass}
            />
          </Field>
          <Field label="Website">
            <input
              type="url"
              value={form.website}
              onChange={bind("website")}
              placeholder="https://"
              className={inputClass}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Διεύθυνση">
              <input
                type="text"
                value={form.address}
                onChange={bind("address")}
                className={inputClass}
              />
            </Field>
          </div>
          <Field label="Facebook URL">
            <input
              type="url"
              value={form.facebook_url}
              onChange={bind("facebook_url")}
              placeholder="https://facebook.com/…"
              className={inputClass}
            />
          </Field>
          <Field label="Instagram URL">
            <input
              type="url"
              value={form.instagram_url}
              onChange={bind("instagram_url")}
              placeholder="https://instagram.com/…"
              className={inputClass}
            />
          </Field>
        </div>
      </section>

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Αποθήκευση…" : "Αποθήκευση"}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>
      {children}
    </label>
  );
}
