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
  DEFAULT_ACCENT,
  DEFAULT_PRIMARY,
  DEFAULT_SECONDARY,
  refreshClubSettings,
  useClubSettings,
} from "@/lib/hooks/useClubSettings";
import type {
  Club,
  ClubSettings,
  ClubSettingsInsert,
  ClubSettingsUpdate,
} from "@/lib/supabase/types";

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

const STORAGE_BUCKET = "club-assets";

type TabId = "info" | "branding" | "themes";

const TAB_HASH: Record<TabId, string> = {
  info: "",
  branding: "#branding",
  themes: "#themes",
};

function tabFromHash(hash: string): TabId {
  if (hash === "#branding") return "branding";
  if (hash === "#themes") return "themes";
  return "info";
}

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
  name: string;
  foundation_year: string;
  afm: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  facebook_url: string;
  instagram_url: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  child_age_threshold: string;
};

function fromSettings(
  s: ClubSettings | null,
  name: string,
  clubRow: Club | null
): FormState {
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
    logo_url: s?.logo_url ?? null,
    primary_color: s?.primary_color ?? DEFAULT_PRIMARY,
    secondary_color: s?.secondary_color ?? DEFAULT_SECONDARY,
    accent_color: s?.accent_color ?? DEFAULT_ACCENT,
    child_age_threshold:
      clubRow?.child_age_threshold != null
        ? String(clubRow.child_age_threshold)
        : "15",
  };
}

export default function ClubInfoPage() {
  const role = useRole();
  const { settings, clubName, loading: clubLoading } = useClubSettings();
  const { clubId, club } = useCurrentClub();
  const [form, setForm] = useState<FormState>(fromSettings(null, "", null));
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("info");

  const isPrivileged = role.isSystemAdmin || role.isPresident;

  useEffect(() => {
    if (!hydrated && !clubLoading && club !== null) {
      setForm(fromSettings(settings.id ? settings : null, clubName, club));
      setHydrated(true);
    }
  }, [settings, clubName, clubLoading, hydrated, club]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setTab(tabFromHash(window.location.hash));
    function onHashChange() {
      setTab(tabFromHash(window.location.hash));
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

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

  function bind<K extends keyof FormState>(key: K) {
    return (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((s) => ({ ...s, [key]: e.target.value }));
  }

  function selectTab(next: TabId) {
    setTab(next);
    if (typeof window !== "undefined") {
      const hash = TAB_HASH[next];
      const url = `${window.location.pathname}${window.location.search}${hash}`;
      window.history.replaceState(null, "", url);
    }
  }

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

  function handleCancel() {
    setForm(fromSettings(settings.id ? settings : null, clubName, club));
    setError(null);
    setInfo(null);
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
    const thresholdRaw = form.child_age_threshold.trim();
    const threshold = Number(thresholdRaw);
    if (
      !thresholdRaw ||
      !Number.isInteger(threshold) ||
      threshold < 1 ||
      threshold > 30
    ) {
      setError("Το όριο ηλικίας πρέπει να είναι μεταξύ 1 και 30 ετών.");
      return;
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
        logo_url: form.logo_url,
        primary_color: form.primary_color,
        secondary_color: form.secondary_color,
        accent_color: form.accent_color,
        updated_at: new Date().toISOString(),
      } satisfies ClubSettingsUpdate;

      const { error: nameErr } = await supabase
        .from("clubs")
        .update({ name, child_age_threshold: threshold })
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
      <header className="mb-3">
        <Link
          href="/settings"
          className="inline-flex items-baseline gap-2 text-xl font-semibold tracking-tight text-foreground transition hover:text-foreground/70"
        >
          <span aria-hidden="true">←</span>
          Ταυτότητα Συλλόγου
        </Link>
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

      <div
        role="tablist"
        aria-label="Ταυτότητα Συλλόγου"
        className="mb-4 inline-flex rounded-xl border border-border bg-surface p-1"
      >
        <TabButton
          active={tab === "info"}
          onClick={() => selectTab("info")}
        >
          Στοιχεία
        </TabButton>
        <TabButton
          active={tab === "branding"}
          onClick={() => selectTab("branding")}
        >
          Branding
        </TabButton>
        <TabButton
          active={tab === "themes"}
          onClick={() => selectTab("themes")}
        >
          Θέματα
        </TabButton>
      </div>

      {tab === "info" && (
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
          <div className="mt-6 border-t border-border pt-4">
            <Field label="Όριο ηλικίας παιδιού">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={30}
                  value={form.child_age_threshold}
                  onChange={bind("child_age_threshold")}
                  className={inputClass + " w-24"}
                />
                <span className="text-sm text-muted">ετών</span>
              </div>
              <p className="mt-2 text-xs text-muted">
                ⓘ Χρησιμοποιείται για catering planning (παιδικά μενού).
                Δεν επηρεάζει εκπτώσεις πληρωμής — αυτές ορίζονται
                ξεχωριστά στις Εκπτώσεις.
              </p>
            </Field>
          </div>
        </section>
      )}

      {tab === "branding" && (
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
                    onChange={handleLogoUpload}
                    disabled={uploading}
                    className="hidden"
                  />
                  {uploading ? "Μεταφόρτωση…" : "Επιλογή αρχείου…"}
                </label>
                {form.logo_url && (
                  <button
                    type="button"
                    onClick={clearLogo}
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
                onChange={(v) =>
                  setForm((s) => ({ ...s, accent_color: v }))
                }
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
      )}

      {tab === "themes" && (
        <section className="rounded-xl border border-border bg-surface p-6">
          <h2 className="mb-1 text-sm font-semibold">Έτοιμα Θέματα</h2>
          <p className="mb-3 text-xs text-muted">
            Επιλέξτε ένα θέμα — τα χρώματα γεμίζουν αυτόματα στο tab «Branding».
            Πατήστε «Αποθήκευση» για να εφαρμοστούν.
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
      )}

      <div className="mt-6 flex justify-end gap-2">
        <button
          type="button"
          onClick={handleCancel}
          disabled={saving}
          className="rounded-lg border border-border px-4 py-2 text-sm transition hover:bg-background disabled:opacity-50"
        >
          Ακύρωση
        </button>
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
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        "rounded-lg px-4 py-1.5 text-sm font-medium transition " +
        (active
          ? "bg-accent text-white shadow-sm"
          : "text-muted hover:bg-foreground/5")
      }
    >
      {children}
    </button>
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
