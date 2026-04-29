"use client";

import {
  useEffect,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { errorMessage, getBrowserClient } from "@/lib/supabase/client";
import { useRole } from "@/lib/hooks/useRole";
import { AccessDenied } from "@/lib/auth/AccessDenied";
import {
  DEFAULT_ACCENT,
  DEFAULT_PRIMARY,
  DEFAULT_SECONDARY,
  refreshClubSettings,
  useClubSettings,
} from "@/lib/hooks/useClubSettings";
import type {
  ClubSettings,
  ClubSettingsInsert,
  ClubSettingsUpdate,
} from "@/lib/supabase/types";

const STORAGE_BUCKET = "club-assets";

type Tab = "info" | "branding";

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

type Preset = {
  id: string;
  label: string;
  primary: string;
  secondary: string;
  accent: string;
};

const PRESETS: Preset[] = [
  {
    id: "classic",
    label: "Κλασικό Μπλε",
    primary: "#2563eb",
    secondary: "#1e40af",
    accent: "#f59e0b",
  },
  {
    id: "burgundy",
    label: "Μπορντό Κρητικό",
    primary: "#7c2d12",
    secondary: "#450a0a",
    accent: "#d97706",
  },
  {
    id: "nature",
    label: "Πράσινο Φύσης",
    primary: "#16a34a",
    secondary: "#15803d",
    accent: "#f59e0b",
  },
];

type FormState = {
  club_name: string;
  founded_year: string;
  tax_id: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  facebook_url: string;
  instagram_url: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  logo_url: string | null;
};

function fromSettings(s: ClubSettings | null): FormState {
  return {
    club_name: s?.club_name ?? "",
    founded_year: s?.founded_year != null ? String(s.founded_year) : "",
    tax_id: s?.tax_id ?? "",
    address: s?.address ?? "",
    phone: s?.phone ?? "",
    email: s?.email ?? "",
    website: s?.website ?? "",
    facebook_url: s?.facebook_url ?? "",
    instagram_url: s?.instagram_url ?? "",
    primary_color: s?.primary_color ?? DEFAULT_PRIMARY,
    secondary_color: s?.secondary_color ?? DEFAULT_SECONDARY,
    accent_color: s?.accent_color ?? DEFAULT_ACCENT,
    logo_url: s?.logo_url ?? null,
  };
}

export default function SettingsPage() {
  const role = useRole();
  const { settings, loading: clubLoading } = useClubSettings();
  const [tab, setTab] = useState<Tab>("info");
  const [form, setForm] = useState<FormState>(fromSettings(null));
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const isPrivileged = role.isSystemAdmin || role.isPresident;

  useEffect(() => {
    if (!hydrated && settings.id) {
      setForm(fromSettings(settings));
      setHydrated(true);
    }
  }, [settings, hydrated]);

  // Live preview: temporarily push form colors to root
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const prev = {
      p: root.style.getPropertyValue("--brand-primary"),
      s: root.style.getPropertyValue("--brand-secondary"),
      a: root.style.getPropertyValue("--brand-accent"),
    };
    root.style.setProperty("--brand-primary", form.primary_color);
    root.style.setProperty("--brand-secondary", form.secondary_color);
    root.style.setProperty("--brand-accent", form.accent_color);
    return () => {
      root.style.setProperty("--brand-primary", prev.p || DEFAULT_PRIMARY);
      root.style.setProperty(
        "--brand-secondary",
        prev.s || DEFAULT_SECONDARY
      );
      root.style.setProperty("--brand-accent", prev.a || DEFAULT_ACCENT);
    };
  }, [form.primary_color, form.secondary_color, form.accent_color]);

  function applyPreset(p: Preset) {
    setForm((s) => ({
      ...s,
      primary_color: p.primary,
      secondary_color: p.secondary,
      accent_color: p.accent,
    }));
  }

  async function handleLogoUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setInfo(null);
    setUploading(true);
    try {
      const supabase = getBrowserClient();
      const ext = file.name.split(".").pop() ?? "png";
      const path = `logos/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || undefined,
        });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(path);
      setForm((s) => ({ ...s, logo_url: urlData.publicUrl }));
      setInfo(
        "Το λογότυπο μεταφορτώθηκε. Πατήστε «Αποθήκευση» για να εφαρμοστεί."
      );
    } catch (err) {
      setError(errorMessage(err, "Σφάλμα μεταφόρτωσης λογοτύπου."));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  function clearLogo() {
    setForm((s) => ({ ...s, logo_url: null }));
  }

  async function handleSave() {
    setError(null);
    setInfo(null);
    if (!form.club_name.trim()) {
      setError("Το όνομα συλλόγου είναι υποχρεωτικό.");
      return;
    }
    let foundedYear: number | null = null;
    if (form.founded_year.trim()) {
      const y = Number(form.founded_year);
      if (!Number.isInteger(y) || y < 1800 || y > 2100) {
        setError("Το έτος ίδρυσης δεν είναι έγκυρο.");
        return;
      }
      foundedYear = y;
    }
    setSaving(true);
    try {
      const supabase = getBrowserClient();
      const payload = {
        club_name: form.club_name.trim(),
        founded_year: foundedYear,
        tax_id: form.tax_id.trim() || null,
        address: form.address.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        website: form.website.trim() || null,
        facebook_url: form.facebook_url.trim() || null,
        instagram_url: form.instagram_url.trim() || null,
        primary_color: form.primary_color,
        secondary_color: form.secondary_color,
        accent_color: form.accent_color,
        logo_url: form.logo_url,
        updated_at: new Date().toISOString(),
      } satisfies ClubSettingsUpdate;

      if (settings.id) {
        const { error: uErr } = await supabase
          .from("club_settings")
          .update(payload)
          .eq("id", settings.id);
        if (uErr) throw uErr;
      } else {
        const insert: ClubSettingsInsert = payload;
        const { error: iErr } = await supabase
          .from("club_settings")
          .insert(insert);
        if (iErr) throw iErr;
      }
      await refreshClubSettings();
      setInfo("Οι ρυθμίσεις αποθηκεύτηκαν.");
    } catch (err) {
      setError(errorMessage(err, "Σφάλμα αποθήκευσης ρυθμίσεων."));
    } finally {
      setSaving(false);
    }
  }

  if (role.loading || clubLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl p-10 text-center text-muted">
        Φόρτωση…
      </div>
    );
  }
  if (role.userId && !isPrivileged) {
    return <AccessDenied />;
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <header className="mb-6">
        <p className="text-sm text-muted">Διαχείριση</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          Ρυθμίσεις Συλλόγου
        </h1>
        <p className="mt-1 text-sm text-muted">
          Στοιχεία επικοινωνίας και branding (όνομα, λογότυπο, χρώματα).
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

      <div className="mb-6 inline-flex rounded-lg border border-border bg-surface p-1 text-sm">
        <TabButton current={tab} value="info" onSelect={setTab}>
          Στοιχεία Συλλόγου
        </TabButton>
        <TabButton current={tab} value="branding" onSelect={setTab}>
          Branding
        </TabButton>
      </div>

      {tab === "info" ? (
        <InfoTab form={form} setForm={setForm} />
      ) : (
        <BrandingTab
          form={form}
          setForm={setForm}
          applyPreset={applyPreset}
          uploading={uploading}
          onUploadLogo={handleLogoUpload}
          onClearLogo={clearLogo}
        />
      )}

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

function TabButton({
  current,
  value,
  onSelect,
  children,
}: {
  current: Tab;
  value: Tab;
  onSelect: (v: Tab) => void;
  children: ReactNode;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={
        "rounded-md px-4 py-1.5 transition " +
        (active
          ? "bg-accent text-white shadow-sm"
          : "text-foreground/80 hover:bg-foreground/5")
      }
    >
      {children}
    </button>
  );
}

function InfoTab({
  form,
  setForm,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
}) {
  function bind<K extends keyof FormState>(key: K) {
    return (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((s) => ({ ...s, [key]: e.target.value }));
  }
  return (
    <section className="rounded-xl border border-border bg-surface p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Όνομα Συλλόγου" required>
          <input
            type="text"
            required
            value={form.club_name}
            onChange={bind("club_name")}
            className={inputClass}
          />
        </Field>
        <Field label="Έτος Ίδρυσης">
          <input
            type="number"
            inputMode="numeric"
            value={form.founded_year}
            onChange={bind("founded_year")}
            placeholder="π.χ. 1985"
            className={inputClass}
          />
        </Field>
        <Field label="ΑΦΜ">
          <input
            type="text"
            value={form.tax_id}
            onChange={bind("tax_id")}
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
  );
}

function BrandingTab({
  form,
  setForm,
  applyPreset,
  uploading,
  onUploadLogo,
  onClearLogo,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  applyPreset: (p: Preset) => void;
  uploading: boolean;
  onUploadLogo: (e: ChangeEvent<HTMLInputElement>) => void;
  onClearLogo: () => void;
}) {
  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-surface p-6">
        <h2 className="mb-3 text-sm font-semibold">Λογότυπο</h2>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border border-border bg-background">
            {form.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={form.logo_url}
                alt="Logo preview"
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-xs text-muted">Χωρίς logo</span>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition hover:bg-foreground/5">
              <input
                type="file"
                accept="image/*"
                onChange={onUploadLogo}
                disabled={uploading}
                className="hidden"
              />
              {uploading ? "Μεταφόρτωση…" : "Επιλογή αρχείου…"}
            </label>
            {form.logo_url && (
              <button
                type="button"
                onClick={onClearLogo}
                className="inline-flex items-center gap-2 rounded-lg border border-danger/30 px-3 py-1.5 text-xs text-danger transition hover:bg-danger/10"
              >
                Αφαίρεση
              </button>
            )}
            <p className="text-[11px] text-muted">
              Αποθηκεύεται στο Supabase Storage bucket «club-assets».
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface p-6">
        <h2 className="mb-1 text-sm font-semibold">Έτοιμα Θέματα</h2>
        <p className="mb-3 text-xs text-muted">
          Επιλέξτε ένα θέμα ή προσαρμόστε τα χρώματα παρακάτω.
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p)}
              className="flex items-center gap-3 rounded-lg border border-border bg-background p-3 text-left transition hover:border-accent/60"
            >
              <span
                className="h-8 w-8 shrink-0 rounded-full"
                style={{ backgroundColor: p.primary }}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{p.label}</span>
                <span className="mt-1 flex gap-1">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: p.secondary }}
                  />
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: p.accent }}
                  />
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface p-6">
        <h2 className="mb-3 text-sm font-semibold">Χρώματα</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <ColorField
            label="Primary"
            hint="Κουμπιά & links"
            value={form.primary_color}
            onChange={(v) =>
              setForm((s) => ({ ...s, primary_color: v }))
            }
          />
          <ColorField
            label="Secondary"
            hint="Hover states"
            value={form.secondary_color}
            onChange={(v) =>
              setForm((s) => ({ ...s, secondary_color: v }))
            }
          />
          <ColorField
            label="Accent"
            hint="Badges & highlights"
            value={form.accent_color}
            onChange={(v) => setForm((s) => ({ ...s, accent_color: v }))}
          />
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface p-6">
        <h2 className="mb-3 text-sm font-semibold">Προεπισκόπηση</h2>
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-background p-4">
          <button
            type="button"
            className="rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90"
            style={{ backgroundColor: form.primary_color }}
          >
            Primary Button
          </button>
          <button
            type="button"
            className="rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
            style={{ backgroundColor: form.secondary_color }}
          >
            Secondary Button
          </button>
          <span
            className="rounded-full px-3 py-1 text-xs font-medium text-white"
            style={{ backgroundColor: form.accent_color }}
          >
            Badge
          </span>
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            className="text-sm font-medium underline"
            style={{ color: form.primary_color }}
          >
            Link
          </a>
        </div>
      </section>
    </div>
  );
}

function ColorField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-muted">
          {label}
          <span className="ml-1 font-normal opacity-70">— {hint}</span>
        </span>
        <span className="flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-1.5">
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="h-7 w-9 cursor-pointer rounded border-none bg-transparent p-0"
          />
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none"
          />
        </span>
      </label>
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
