"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { errorMessage, getBrowserClient } from "@/lib/supabase/client";
import { useRole } from "@/lib/hooks/useRole";
import { useCurrentClub } from "@/lib/hooks/useCurrentClub";
import { AccessDenied } from "@/lib/auth/AccessDenied";
import type {
  Member,
  Sponsor,
  SponsorInsert,
  SponsorUpdate,
} from "@/lib/supabase/types";

type SponsorWithStats = Sponsor & {
  event_count: number;
  member?: { first_name: string; last_name: string } | null;
};

type FormState = {
  external_name: string;
  contact_phone: string;
  contact_email: string;
  notes: string;
  member_id: string;
};

const EMPTY_FORM: FormState = {
  external_name: "",
  contact_phone: "",
  contact_email: "",
  notes: "",
  member_id: "",
};

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

function displayName(s: SponsorWithStats): string {
  if (s.member) return `${s.member.last_name} ${s.member.first_name}`.trim();
  return s.external_name ?? "—";
}

export default function SponsorsPage() {
  const role = useRole();
  const { clubId, loading: clubLoading } = useCurrentClub();
  const [sponsors, setSponsors] = useState<SponsorWithStats[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SponsorWithStats | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!clubId) return;
    try {
      const supabase = getBrowserClient();
      const [sRes, eRes, mRes] = await Promise.all([
        supabase
          .from("sponsors")
          .select("*, members(first_name,last_name)")
          .eq("club_id", clubId)
          .order("external_name", { ascending: true, nullsFirst: false }),
        supabase
          .from("event_sponsors")
          .select("sponsor_id")
          .eq("club_id", clubId),
        supabase
          .from("members")
          .select("*")
          .eq("club_id", clubId)
          .eq("status", "active")
          .order("last_name", { ascending: true }),
      ]);
      if (sRes.error) throw sRes.error;
      if (eRes.error) throw eRes.error;
      if (mRes.error) throw mRes.error;

      const counts = new Map<string, number>();
      for (const e of eRes.data ?? []) {
        counts.set(e.sponsor_id, (counts.get(e.sponsor_id) ?? 0) + 1);
      }

      setSponsors(
        ((sRes.data ?? []) as Array<
          Sponsor & {
            members?: { first_name: string; last_name: string } | null;
          }
        >).map((s) => ({
          ...(s as Sponsor),
          event_count: counts.get(s.id) ?? 0,
          member: s.members ?? null,
        }))
      );
      setMembers((mRes.data ?? []) as Member[]);
      setError(null);
    } catch (err) {
      setError(errorMessage(err, "Σφάλμα φόρτωσης χορηγών."));
    } finally {
      setLoading(false);
    }
  }, [clubId]);

  useEffect(() => {
    if (clubLoading) return;
    load();
  }, [load, clubLoading]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sponsors;
    return sponsors.filter((s) =>
      `${displayName(s)} ${s.contact_phone ?? ""} ${s.contact_email ?? ""}`
        .toLowerCase()
        .includes(q)
    );
  }, [sponsors, search]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(s: SponsorWithStats) {
    setEditing(s);
    setForm({
      external_name: s.external_name ?? "",
      contact_phone: s.contact_phone ?? "",
      contact_email: s.contact_email ?? "",
      notes: s.notes ?? "",
      member_id: s.member_id ?? "",
    });
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setModalOpen(false);
    setEditing(null);
    setFormError(null);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const memberId = form.member_id || null;
    const externalName = form.external_name.trim() || null;
    if (!memberId && !externalName) {
      setFormError("Συμπληρώστε όνομα ή επιλέξτε μέλος.");
      return;
    }
    if (!clubId) {
      setFormError("Δεν έχει εντοπιστεί σύλλογος.");
      return;
    }
    setSaving(true);
    try {
      const supabase = getBrowserClient();
      const payload = {
        member_id: memberId,
        external_name: memberId ? null : externalName,
        contact_phone: form.contact_phone.trim() || null,
        contact_email: form.contact_email.trim() || null,
        notes: form.notes.trim() || null,
      };
      if (editing) {
        const update: SponsorUpdate = payload;
        const { error: uErr } = await supabase
          .from("sponsors")
          .update(update)
          .eq("id", editing.id)
          .eq("club_id", clubId);
        if (uErr) throw uErr;
      } else {
        const insert: SponsorInsert = { ...payload, club_id: clubId };
        const { error: iErr } = await supabase.from("sponsors").insert(insert);
        if (iErr) throw iErr;
      }
      setModalOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      setFormError(errorMessage(err, "Σφάλμα αποθήκευσης."));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(s: SponsorWithStats) {
    const name = displayName(s);
    const warn =
      s.event_count > 0
        ? `Ο χορηγός «${name}» συνδέεται με ${s.event_count} εκδηλώσεις. Οι σχέσεις θα διαγραφούν επίσης. `
        : `Διαγραφή χορηγού «${name}»; `;
    if (!window.confirm(warn + "Η ενέργεια δεν αναιρείται.")) return;
    if (!clubId) return;
    try {
      const supabase = getBrowserClient();
      const { error: dErr } = await supabase
        .from("sponsors")
        .delete()
        .eq("id", s.id)
        .eq("club_id", clubId);
      if (dErr) throw dErr;
      await load();
    } catch (err) {
      setError(errorMessage(err, "Σφάλμα διαγραφής."));
    }
  }

  if (role.loading) {
    return (
      <div className="mx-auto w-full max-w-6xl p-10 text-center text-muted">
        Φόρτωση…
      </div>
    );
  }
  if (role.userId && !role.permissions.includes("events")) {
    return <AccessDenied />;
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">Διαχείριση</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Χορηγοί
          </h1>
          <p className="mt-1 text-sm text-muted">
            Επιχειρήσεις και μέλη που υποστηρίζουν τις εκδηλώσεις του συλλόγου.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90"
        >
          + Νέος Χορηγός
        </button>
      </header>

      <div className="mb-4">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Αναζήτηση…"
          className="w-full rounded-lg border border-border bg-surface px-4 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-background/50 text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="px-4 py-3">Όνομα</th>
                <th className="px-4 py-3">Τύπος</th>
                <th className="px-4 py-3">Τηλέφωνο</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3 text-right"># Εκδηλώσεις</th>
                <th className="px-4 py-3 text-right">Ενέργειες</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted">
                    Φόρτωση…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted">
                    {sponsors.length === 0
                      ? "Δεν υπάρχουν χορηγοί ακόμα."
                      : "Δεν βρέθηκαν αποτελέσματα."}
                  </td>
                </tr>
              ) : (
                filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-background/40">
                    <td className="px-4 py-3 font-medium">{displayName(s)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          "rounded-full px-2 py-0.5 text-[10px] " +
                          (s.member_id
                            ? "bg-blue-500/10 text-blue-700 dark:text-blue-300"
                            : "bg-amber-500/10 text-amber-700 dark:text-amber-300")
                        }
                      >
                        {s.member_id ? "Μέλος" : "Εξωτερικός"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {s.contact_phone ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {s.contact_email ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-muted">
                      {s.event_count}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(s)}
                          className="rounded-md border border-border px-3 py-1 text-xs transition hover:bg-background"
                        >
                          Επεξεργασία
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(s)}
                          className="rounded-md border border-danger/30 px-3 py-1 text-xs text-danger transition hover:bg-danger/10"
                        >
                          Διαγραφή
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <SponsorModal
          editing={editing}
          form={form}
          setForm={setForm}
          members={members}
          saving={saving}
          formError={formError}
          onClose={closeModal}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}

function SponsorModal({
  editing,
  form,
  setForm,
  members,
  saving,
  formError,
  onClose,
  onSubmit,
}: {
  editing: SponsorWithStats | null;
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  members: Member[];
  saving: boolean;
  formError: string | null;
  onClose: () => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}) {
  const isMemberMode = !!form.member_id;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold">
          {editing ? "Επεξεργασία Χορηγού" : "Νέος Χορηγός"}
        </h2>

        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Σύνδεση με Μέλος (προαιρετικό)">
            <select
              value={form.member_id}
              onChange={(e) =>
                setForm((s) => ({ ...s, member_id: e.target.value }))
              }
              className={inputClass}
            >
              <option value="">— Εξωτερικός χορηγός —</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.last_name} {m.first_name}
                </option>
              ))}
            </select>
          </Field>

          {!isMemberMode && (
            <Field label="Όνομα Χορηγού" required>
              <input
                type="text"
                required
                value={form.external_name}
                onChange={(e) =>
                  setForm((s) => ({ ...s, external_name: e.target.value }))
                }
                className={inputClass}
              />
            </Field>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Τηλέφωνο">
              <input
                type="tel"
                value={form.contact_phone}
                onChange={(e) =>
                  setForm((s) => ({ ...s, contact_phone: e.target.value }))
                }
                className={inputClass}
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={form.contact_email}
                onChange={(e) =>
                  setForm((s) => ({ ...s, contact_email: e.target.value }))
                }
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="Σημειώσεις">
            <textarea
              value={form.notes}
              onChange={(e) =>
                setForm((s) => ({ ...s, notes: e.target.value }))
              }
              rows={3}
              className={inputClass}
            />
          </Field>

          {formError && (
            <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
              {formError}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-border px-4 py-2 text-sm transition hover:bg-background disabled:opacity-50"
            >
              Ακύρωση
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {saving
                ? "Αποθήκευση…"
                : editing
                  ? "Αποθήκευση Αλλαγών"
                  : "Δημιουργία"}
            </button>
          </div>
        </form>
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
