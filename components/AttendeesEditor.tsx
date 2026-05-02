"use client";

import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { errorMessage, getBrowserClient } from "@/lib/supabase/client";
import {
  FAMILY_ROLE_LABELS,
  type Member,
  type PresenceStatus,
} from "@/lib/supabase/types";
import {
  formatMemberName,
  getAge,
  nextPresenceStatus,
  resolveIsChild,
  sortAttendees,
  type AttendeeWithMember,
  type IsChildResolution,
  type ReservationWithAttendees,
} from "@/lib/utils/attendees";
import { useCurrentClub } from "@/lib/hooks/useCurrentClub";
import { ConfirmDeleteReservationModal } from "@/components/ConfirmDeleteReservationModal";

type AddMode = "member" | "guest" | "anonymous";

interface AttendeesEditorProps {
  reservation: ReservationWithAttendees;
  members: Member[];
  onClose: () => void;
  onUpdate: () => void | Promise<void>;
}

export function AttendeesEditor({
  reservation,
  members,
  onClose,
  onUpdate,
}: AttendeesEditorProps) {
  const [addMode, setAddMode] = useState<AddMode>("member");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [guestNameInput, setGuestNameInput] = useState("");
  const [anonymousCountInput, setAnonymousCountInput] = useState("1");
  const [anonymousAsChildren, setAnonymousAsChildren] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [promotionMode, setPromotionMode] = useState<"member" | "guest">(
    "member"
  );
  const [promotionGuestName, setPromotionGuestName] = useState("");
  const [promotionSearch, setPromotionSearch] = useState("");
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [optimisticPresence, setOptimisticPresence] = useState<
    Record<
      string,
      { presence_status: PresenceStatus; checked_in_at: string | null }
    >
  >({});
  const [optimisticChildOverride, setOptimisticChildOverride] = useState<
    Record<string, boolean | null>
  >({});

  const { club } = useCurrentClub();
  const clubThreshold = club?.child_age_threshold ?? 15;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 250);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const attendees = useMemo(() => {
    const merged = (reservation.attendees ?? []).map((a) => {
      const o = optimisticPresence[a.id];
      const withPresence = o ? { ...a, ...o } : a;
      if (a.id in optimisticChildOverride) {
        return {
          ...withPresence,
          is_child_override: optimisticChildOverride[a.id],
        };
      }
      return withPresence;
    });
    return sortAttendees(merged);
  }, [reservation.attendees, optimisticPresence, optimisticChildOverride]);
  const totalCount = attendees.length;
  const presentCount = useMemo(
    () => attendees.filter((a) => a.presence_status === "present").length,
    [attendees]
  );
  const expectedCount = useMemo(
    () => attendees.filter((a) => a.presence_status === "expected").length,
    [attendees]
  );
  const noShowCount = useMemo(
    () => attendees.filter((a) => a.presence_status === "no_show").length,
    [attendees]
  );

  const childResolutions = useMemo(() => {
    const map = new Map<string, IsChildResolution>();
    for (const a of attendees) {
      map.set(a.id, resolveIsChild(a, clubThreshold));
    }
    return map;
  }, [attendees, clubThreshold]);
  const childCount = useMemo(
    () =>
      Array.from(childResolutions.values()).filter((r) => r.isChild).length,
    [childResolutions]
  );
  const adultCount = totalCount - childCount;

  const existingMemberIds = useMemo(
    () =>
      new Set(
        attendees
          .map((a) => a.member_id)
          .filter((id): id is string => typeof id === "string")
      ),
    [attendees]
  );

  const filteredMembers = useMemo(() => {
    const q = debouncedQuery.toLowerCase();
    if (q.length < 2) return [] as Member[];
    return members
      .filter((m) => {
        const name = `${m.first_name} ${m.last_name}`.toLowerCase();
        const reverse = `${m.last_name} ${m.first_name}`.toLowerCase();
        return name.includes(q) || reverse.includes(q);
      })
      .slice(0, 10);
  }, [members, debouncedQuery]);

  const promotionFilteredMembers = useMemo(() => {
    const q = promotionSearch.trim().toLowerCase();
    if (q.length < 2) return [] as Member[];
    return members
      .filter((m) => {
        if (existingMemberIds.has(m.id)) return false;
        const name = `${m.first_name} ${m.last_name}`.toLowerCase();
        const reverse = `${m.last_name} ${m.first_name}`.toLowerCase();
        return name.includes(q) || reverse.includes(q);
      })
      .slice(0, 10);
  }, [members, promotionSearch, existingMemberIds]);

  const leadAttendee = useMemo(
    () => attendees.find((a) => a.is_lead && a.member) ?? null,
    [attendees]
  );

  const familySuggestions = useMemo(() => {
    if (!leadAttendee?.member?.family_id) return [] as Member[];
    const familyId = leadAttendee.member.family_id;
    const leadId = leadAttendee.member.id;
    return members.filter(
      (m) =>
        m.family_id === familyId &&
        m.id !== leadId &&
        !existingMemberIds.has(m.id)
    );
  }, [leadAttendee, members, existingMemberIds]);

  async function syncPaxCount() {
    const supabase = getBrowserClient();
    const { count, error: cErr } = await supabase
      .from("reservation_attendees")
      .select("id", { count: "exact", head: true })
      .eq("reservation_id", reservation.id);
    if (cErr) throw cErr;
    if (typeof count === "number" && count > 0) {
      let q = supabase
        .from("reservations")
        .update({ pax_count: count })
        .eq("id", reservation.id);
      if (reservation.club_id) q = q.eq("club_id", reservation.club_id);
      const { error: uErr } = await q;
      if (uErr) throw uErr;
    }
  }

  async function runWithBusy(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await syncPaxCount();
      await onUpdate();
    } catch (err) {
      setError(errorMessage(err, "Σφάλμα αποθήκευσης."));
    } finally {
      setBusy(false);
    }
  }

  async function handleAddMember(memberId: string) {
    if (existingMemberIds.has(memberId)) return;
    await runWithBusy(async () => {
      const supabase = getBrowserClient();
      const { error: iErr } = await supabase
        .from("reservation_attendees")
        .insert({
          reservation_id: reservation.id,
          club_id: reservation.club_id,
          member_id: memberId,
        });
      if (iErr) throw iErr;
      setSearchQuery("");
      setDebouncedQuery("");
    });
  }

  async function handleAddGuest() {
    const name = guestNameInput.trim();
    if (!name) {
      setError("Δώστε όνομα επισκέπτη.");
      return;
    }
    await runWithBusy(async () => {
      const supabase = getBrowserClient();
      const { error: iErr } = await supabase
        .from("reservation_attendees")
        .insert({
          reservation_id: reservation.id,
          club_id: reservation.club_id,
          guest_name: name,
        });
      if (iErr) throw iErr;
      setGuestNameInput("");
    });
  }

  async function handleAddAnonymous() {
    const n = Number(anonymousCountInput);
    if (!Number.isInteger(n) || n <= 0) {
      setError("Ο αριθμός ατόμων πρέπει να είναι θετικός ακέραιος.");
      return;
    }
    if (n > 50) {
      setError("Μέγιστο 50 ανώνυμα ανά προσθήκη.");
      return;
    }
    await runWithBusy(async () => {
      const supabase = getBrowserClient();
      const isChild = anonymousAsChildren;
      const rows = Array.from({ length: n }, () => ({
        reservation_id: reservation.id,
        club_id: reservation.club_id,
        is_child_override: isChild ? true : null,
      }));
      const { error: iErr } = await supabase
        .from("reservation_attendees")
        .insert(rows);
      if (iErr) throw iErr;
      setAnonymousCountInput("1");
      setAnonymousAsChildren(false);
    });
  }

  async function handleTogglePresence(
    attendeeId: string,
    currentStatus: PresenceStatus
  ) {
    const newStatus = nextPresenceStatus(currentStatus);
    const newCheckedInAt =
      newStatus === "present" ? new Date().toISOString() : null;
    setOptimisticPresence((prev) => ({
      ...prev,
      [attendeeId]: {
        presence_status: newStatus,
        checked_in_at: newCheckedInAt,
      },
    }));
    setError(null);
    try {
      const supabase = getBrowserClient();
      const { error: uErr } = await supabase
        .from("reservation_attendees")
        .update({
          presence_status: newStatus,
          checked_in_at: newCheckedInAt,
        })
        .eq("id", attendeeId);
      if (uErr) throw uErr;
      await onUpdate();
    } catch (err) {
      setError(errorMessage(err, "Σφάλμα ενημέρωσης παρουσίας."));
    } finally {
      setOptimisticPresence((prev) => {
        const next = { ...prev };
        delete next[attendeeId];
        return next;
      });
    }
  }

  async function handleToggleChild(
    attendeeId: string,
    currentOverride: boolean | null
  ) {
    const newOverride: boolean | null =
      currentOverride === null
        ? true
        : currentOverride === true
          ? false
          : null;
    setOptimisticChildOverride((prev) => ({
      ...prev,
      [attendeeId]: newOverride,
    }));
    setError(null);
    try {
      const supabase = getBrowserClient();
      const { error: uErr } = await supabase
        .from("reservation_attendees")
        .update({ is_child_override: newOverride })
        .eq("id", attendeeId);
      if (uErr) throw uErr;
      await onUpdate();
    } catch (err) {
      setError(errorMessage(err, "Σφάλμα ενημέρωσης κατηγορίας ηλικίας."));
    } finally {
      setOptimisticChildOverride((prev) => {
        const next = { ...prev };
        delete next[attendeeId];
        return next;
      });
    }
  }

  async function handleRemove(attendeeId: string) {
    await runWithBusy(async () => {
      const supabase = getBrowserClient();
      const { error: dErr } = await supabase
        .from("reservation_attendees")
        .delete()
        .eq("id", attendeeId);
      if (dErr) throw dErr;
    });
  }

  async function handleToggleLead(
    attendeeId: string,
    currentlyLead: boolean
  ) {
    await runWithBusy(async () => {
      const supabase = getBrowserClient();
      if (currentlyLead) {
        const { error: uErr } = await supabase
          .from("reservation_attendees")
          .update({ is_lead: false })
          .eq("id", attendeeId);
        if (uErr) throw uErr;
        return;
      }
      const { error: rErr } = await supabase
        .from("reservation_attendees")
        .update({ is_lead: false })
        .eq("reservation_id", reservation.id)
        .eq("is_lead", true);
      if (rErr) throw rErr;
      const { error: uErr } = await supabase
        .from("reservation_attendees")
        .update({ is_lead: true })
        .eq("id", attendeeId);
      if (uErr) throw uErr;
    });
  }

  async function handlePromoteToMember(attendeeId: string, memberId: string) {
    if (existingMemberIds.has(memberId)) {
      setError("Το μέλος είναι ήδη στην παρέα.");
      return;
    }
    await runWithBusy(async () => {
      const supabase = getBrowserClient();
      const { error: uErr } = await supabase
        .from("reservation_attendees")
        .update({ member_id: memberId, guest_name: null })
        .eq("id", attendeeId);
      if (uErr) throw uErr;
      setPromotingId(null);
      setPromotionSearch("");
    });
  }

  async function handlePromoteToGuest(attendeeId: string) {
    const name = promotionGuestName.trim();
    if (!name) {
      setError("Δώστε όνομα επισκέπτη.");
      return;
    }
    await runWithBusy(async () => {
      const supabase = getBrowserClient();
      const { error: uErr } = await supabase
        .from("reservation_attendees")
        .update({ guest_name: name, member_id: null })
        .eq("id", attendeeId);
      if (uErr) throw uErr;
      setPromotingId(null);
      setPromotionGuestName("");
    });
  }

  function startPromotion(id: string) {
    setPromotingId(id);
    setPromotionMode("member");
    setPromotionGuestName("");
    setPromotionSearch("");
  }

  async function handleDeleteReservation() {
    setIsDeleting(true);
    setError(null);
    try {
      const supabase = getBrowserClient();
      const { error: dErr } = await supabase
        .from("reservations")
        .delete()
        .eq("id", reservation.id);
      if (dErr) throw dErr;
      setIsConfirmDeleteOpen(false);
      await onUpdate();
      onClose();
    } catch (err) {
      setError(errorMessage(err, "Σφάλμα κατά τη διαγραφή."));
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <ModalShell
      title={reservation.group_name}
      onClose={onClose}
      headerAction={
        <button
          type="button"
          onClick={() => setIsConfirmDeleteOpen(true)}
          disabled={busy || isDeleting}
          className="rounded p-1 text-danger transition hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50"
          title="Διαγραφή παρέας"
          aria-label="Διαγραφή παρέας"
        >
          🗑️
        </button>
      }
    >
      <ConfirmDeleteReservationModal
        isOpen={isConfirmDeleteOpen}
        onClose={() => setIsConfirmDeleteOpen(false)}
        onConfirm={handleDeleteReservation}
        reservation={{
          group_name: reservation.group_name,
          pax_count: reservation.pax_count,
          table_number: reservation.table_number,
        }}
        isDeleting={isDeleting}
      />
      {error && (
        <div className="mb-3 flex items-start justify-between gap-2 rounded-md border border-danger/30 bg-danger/10 p-2 text-xs text-danger">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="shrink-0 rounded px-1 hover:opacity-70"
            aria-label="Κλείσιμο"
          >
            ✕
          </button>
        </div>
      )}

      <section className="mb-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          Λίστα ατόμων ({totalCount} άτομα ·{" "}
          {presentCount === 1 ? "1 παρών" : `${presentCount} παρόντες`}
          {expectedCount > 0 &&
            ` · ${
              expectedCount === 1
                ? "1 αναμένεται"
                : `${expectedCount} αναμένονται`
            }`}
          {noShowCount > 0 &&
            ` · ${
              noShowCount === 1 ? "1 δεν ήρθε" : `${noShowCount} δεν ήρθαν`
            }`}
          )
        </h3>
        {childCount > 0 && (
          <p className="mb-2 text-xs text-muted">
            {totalCount} ·{" "}
            {adultCount === 1 ? "1 ενήλικας" : `${adultCount} ενήλικες`}
            {" · "}
            {childCount === 1 ? "1 παιδί" : `${childCount} παιδιά`}
          </p>
        )}
        {totalCount === 0 ? (
          <p className="rounded-md border border-dashed border-border p-3 text-center text-xs text-muted">
            Δεν υπάρχουν άτομα.
          </p>
        ) : (
          <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-md border border-border bg-background p-2">
            {attendees.map((a) => (
              <AttendeeRow
                key={a.id}
                attendee={a}
                disabled={busy}
                isPromoting={promotingId === a.id}
                promotionMode={promotionMode}
                promotionGuestName={promotionGuestName}
                promotionSearch={promotionSearch}
                promotionMatches={
                  promotingId === a.id ? promotionFilteredMembers : []
                }
                childResolution={
                  childResolutions.get(a.id) ?? {
                    isChild: false,
                    source: "unknown",
                  }
                }
                onTogglePresence={() =>
                  handleTogglePresence(a.id, a.presence_status)
                }
                onToggleChild={() =>
                  handleToggleChild(a.id, a.is_child_override ?? null)
                }
                onToggleLead={() => handleToggleLead(a.id, a.is_lead)}
                onRemove={() => handleRemove(a.id)}
                onStartPromote={() => startPromotion(a.id)}
                onCancelPromote={() => setPromotingId(null)}
                onChangePromotionMode={setPromotionMode}
                onChangePromotionGuestName={setPromotionGuestName}
                onChangePromotionSearch={setPromotionSearch}
                onPromoteToMember={(memberId) =>
                  handlePromoteToMember(a.id, memberId)
                }
                onPromoteToGuest={() => handlePromoteToGuest(a.id)}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="mb-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          + Προσθήκη ατόμου
        </h3>
        <div className="mb-2 flex gap-3 text-xs">
          <ModeRadio
            checked={addMode === "member"}
            onChange={() => setAddMode("member")}
            label="Από Μητρώο"
          />
          <ModeRadio
            checked={addMode === "guest"}
            onChange={() => setAddMode("guest")}
            label="Επισκέπτης"
          />
          <ModeRadio
            checked={addMode === "anonymous"}
            onChange={() => setAddMode("anonymous")}
            label="Ανώνυμοι"
          />
        </div>

        {addMode === "member" && (
          <div>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Αναζήτηση μέλους (≥2 χαρακτήρες)…"
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              disabled={busy}
            />
            {debouncedQuery.length >= 2 && (
              <ul className="mt-1 max-h-48 overflow-y-auto rounded-md border border-border bg-background">
                {filteredMembers.length === 0 ? (
                  <li className="p-2 text-xs text-muted">Καμία αντιστοιχία.</li>
                ) : (
                  filteredMembers.map((m) => {
                    const already = existingMemberIds.has(m.id);
                    return (
                      <li key={m.id}>
                        <button
                          type="button"
                          disabled={already || busy}
                          onClick={() => handleAddMember(m.id)}
                          className="flex w-full items-center justify-between p-2 text-left text-xs transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <span>{formatMemberName(m)}</span>
                          {already && (
                            <span className="text-amber-600 dark:text-amber-400">
                              ήδη στην παρέα
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            )}
          </div>
        )}

        {addMode === "guest" && (
          <div className="flex gap-2">
            <input
              type="text"
              value={guestNameInput}
              onChange={(e) => setGuestNameInput(e.target.value)}
              placeholder="Όνομα επισκέπτη"
              className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              disabled={busy}
            />
            <button
              type="button"
              onClick={handleAddGuest}
              disabled={busy || !guestNameInput.trim()}
              className="rounded-md border border-accent bg-accent/10 px-3 py-1.5 text-xs text-accent transition hover:bg-accent/20 disabled:opacity-50"
            >
              + Προσθήκη
            </button>
          </div>
        )}

        {addMode === "anonymous" && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted">Πλήθος:</label>
            <input
              type="number"
              min={1}
              max={50}
              value={anonymousCountInput}
              onChange={(e) => setAnonymousCountInput(e.target.value)}
              className="w-20 rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
              disabled={busy}
            />
            <label className="inline-flex cursor-pointer items-center gap-1 text-xs text-muted">
              <input
                type="checkbox"
                checked={anonymousAsChildren}
                onChange={(e) => setAnonymousAsChildren(e.target.checked)}
                disabled={busy}
                className="h-3 w-3 accent-accent"
              />
              <span>Παιδιά</span>
            </label>
            <button
              type="button"
              onClick={handleAddAnonymous}
              disabled={busy}
              className="rounded-md border border-accent bg-accent/10 px-3 py-1.5 text-xs text-accent transition hover:bg-accent/20 disabled:opacity-50"
            >
              + Προσθήκη ανώνυμων
            </button>
          </div>
        )}
      </section>

      {familySuggestions.length > 0 && leadAttendee?.member && (
        <section className="mb-4 rounded-md border border-blue-300/40 bg-blue-50 p-3 dark:border-blue-500/30 dark:bg-blue-500/10">
          <p className="mb-2 text-xs font-medium text-blue-900 dark:text-blue-200">
            💡 Πρόσθεσε από οικογένεια {leadAttendee.member.last_name}:
          </p>
          <ul className="flex flex-col gap-1">
            {familySuggestions.map((m) => {
              const age = getAge(m.birth_date);
              const roleLabel = m.family_role
                ? FAMILY_ROLE_LABELS[m.family_role]
                : null;
              return (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-2 rounded-md bg-white/60 px-2 py-1 text-xs dark:bg-black/20"
                >
                  <span>
                    {formatMemberName(m)}
                    {(roleLabel || age != null) && (
                      <small className="ml-2 text-muted">
                        (
                        {[roleLabel, age != null ? `${age} ετών` : null]
                          .filter(Boolean)
                          .join(" · ")}
                        )
                      </small>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleAddMember(m.id)}
                    disabled={busy}
                    className="rounded border border-blue-500/40 bg-blue-500/10 px-2 py-0.5 text-blue-700 transition hover:bg-blue-500/20 disabled:opacity-50 dark:text-blue-200"
                  >
                    + Προσθήκη
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="flex items-center justify-between border-t border-border pt-3 text-xs text-muted">
        <span>
          Σύνολο:{" "}
          <span className="font-semibold text-foreground">{totalCount}</span>{" "}
          {totalCount === 1 ? "άτομο" : "άτομα"}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-border px-3 py-1.5 transition hover:bg-background"
        >
          Κλείσιμο
        </button>
      </div>
    </ModalShell>
  );
}

function AttendeeRow({
  attendee,
  disabled,
  isPromoting,
  promotionMode,
  promotionGuestName,
  promotionSearch,
  promotionMatches,
  childResolution,
  onTogglePresence,
  onToggleChild,
  onToggleLead,
  onRemove,
  onStartPromote,
  onCancelPromote,
  onChangePromotionMode,
  onChangePromotionGuestName,
  onChangePromotionSearch,
  onPromoteToMember,
  onPromoteToGuest,
}: {
  attendee: AttendeeWithMember;
  disabled: boolean;
  isPromoting: boolean;
  promotionMode: "member" | "guest";
  promotionGuestName: string;
  promotionSearch: string;
  promotionMatches: Member[];
  childResolution: IsChildResolution;
  onTogglePresence: () => void;
  onToggleChild: () => void;
  onToggleLead: () => void;
  onRemove: () => void;
  onStartPromote: () => void;
  onCancelPromote: () => void;
  onChangePromotionMode: (m: "member" | "guest") => void;
  onChangePromotionGuestName: (v: string) => void;
  onChangePromotionSearch: (v: string) => void;
  onPromoteToMember: (memberId: string) => void;
  onPromoteToGuest: () => void;
}) {
  const isMember = !!attendee.member_id && !!attendee.member;
  const isGuest = !attendee.member_id && !!attendee.guest_name;
  const isAnonymous = !attendee.member_id && !attendee.guest_name;
  const isPresent = attendee.presence_status === "present";
  const isExpected = attendee.presence_status === "expected";
  const isAbsent = attendee.presence_status === "no_show";

  const nameClass = `font-medium transition-all duration-150 ${
    isAbsent ? "line-through" : ""
  }`;
  const anonClass = `text-muted transition-all duration-150 ${
    isAbsent ? "line-through" : ""
  }`;

  const presenceIcon = isPresent ? (
    <span aria-hidden className="shrink-0 text-sm leading-none">
      ✅
    </span>
  ) : isAbsent ? (
    <span
      aria-hidden
      className="shrink-0 text-sm font-bold leading-none text-amber-600 dark:text-amber-400"
    >
      ✗
    </span>
  ) : (
    <span
      aria-hidden
      className="shrink-0 text-sm leading-none text-muted/60"
    >
      ☐
    </span>
  );

  const presenceLabel = isPresent
    ? "Παρών"
    : isAbsent
      ? "Δεν ήρθε"
      : "Αναμένεται";
  const nextActionLabel = isPresent ? "Δεν ήρθε" : "Παρών";

  let label: ReactNode;
  if (isMember && attendee.member) {
    label = (
      <>
        <span className={nameClass}>
          {formatMemberName(attendee.member)}
        </span>{" "}
        <span className="text-muted">(μέλος)</span>
      </>
    );
  } else if (isGuest) {
    label = (
      <>
        <span className={nameClass}>{attendee.guest_name}</span>{" "}
        <span className="text-muted">(επισκέπτης)</span>
      </>
    );
  } else {
    label = <span className={anonClass}>Ανώνυμο</span>;
  }

  function handleRowClick() {
    if (disabled || isPromoting) return;
    onTogglePresence();
  }

  return (
    <li
      role="button"
      tabIndex={0}
      onClick={handleRowClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleRowClick();
        }
      }}
      aria-pressed={isPresent}
      aria-label={`${presenceLabel} — πάτησε για ${nextActionLabel}`}
      title={`Πάτησε για: ${nextActionLabel}`}
      className={`flex cursor-pointer flex-col gap-1 rounded-md border border-border bg-surface px-2 py-1.5 text-xs transition-all duration-150 hover:bg-background ${
        isAbsent ? "opacity-60" : "opacity-100"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 truncate">
          {presenceIcon}
          <ChildIndicator
            attendee={attendee}
            childResolution={childResolution}
            disabled={disabled}
            onToggleChild={onToggleChild}
          />
          <span className="min-w-0 truncate">{label}</span>
          {isAbsent && (
            <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
              Δεν ήρθε
            </span>
          )}
        </span>
        <div
          className="flex shrink-0 items-center gap-1"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {attendee.is_lead && (
            <button
              type="button"
              disabled={disabled}
              onClick={onToggleLead}
              className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 transition hover:bg-amber-500/25 disabled:opacity-50 dark:text-amber-300"
              title="Αφαίρεση αρχηγού"
              aria-label="Αφαίρεση αρχηγού"
            >
              ★ Αρχηγός
            </button>
          )}
          {isMember && !attendee.is_lead && (
            <button
              type="button"
              disabled={disabled}
              onClick={onToggleLead}
              className="rounded border border-border px-1.5 py-0.5 text-[11px] transition hover:bg-background disabled:opacity-50"
              title="Ορισμός ως αρχηγός"
              aria-label="Ορισμός ως αρχηγός"
            >
              ★
            </button>
          )}
          {isAnonymous && !isPromoting && (
            <button
              type="button"
              disabled={disabled}
              onClick={onStartPromote}
              className="rounded border border-border px-1.5 py-0.5 text-[11px] transition hover:bg-background disabled:opacity-50"
              title="Ονομάτισε"
            >
              Ονομάτισε
            </button>
          )}
          <button
            type="button"
            disabled={disabled}
            onClick={onRemove}
            className="rounded border border-danger/40 px-1.5 py-0.5 text-[11px] text-danger transition hover:bg-danger/10 disabled:opacity-50"
            title="Αφαίρεση"
            aria-label="Αφαίρεση"
          >
            ×
          </button>
        </div>
      </div>

      {isPromoting && (
        <div
          className="mt-1 flex flex-col gap-1.5 rounded-md border border-accent/30 bg-accent/5 p-2"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 text-[11px]">
            <ModeRadio
              checked={promotionMode === "member"}
              onChange={() => onChangePromotionMode("member")}
              label="Μέλος"
            />
            <ModeRadio
              checked={promotionMode === "guest"}
              onChange={() => onChangePromotionMode("guest")}
              label="Επισκέπτης"
            />
            <button
              type="button"
              onClick={onCancelPromote}
              className="ml-auto rounded px-1 text-[11px] hover:opacity-70"
            >
              Άκυρο
            </button>
          </div>
          {promotionMode === "member" ? (
            <div>
              <input
                type="search"
                value={promotionSearch}
                onChange={(e) => onChangePromotionSearch(e.target.value)}
                placeholder="Αναζήτηση μέλους…"
                className="w-full rounded-md border border-border bg-background px-2 py-1 text-[11px] outline-none focus:border-accent"
                disabled={disabled}
              />
              {promotionSearch.trim().length >= 2 && (
                <ul className="mt-1 max-h-32 overflow-y-auto rounded-md border border-border bg-background">
                  {promotionMatches.length === 0 ? (
                    <li className="p-1.5 text-[11px] text-muted">
                      Καμία αντιστοιχία.
                    </li>
                  ) : (
                    promotionMatches.map((m) => (
                      <li key={m.id}>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => onPromoteToMember(m.id)}
                          className="block w-full px-2 py-1 text-left text-[11px] transition hover:bg-surface disabled:opacity-60"
                        >
                          {formatMemberName(m)}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
          ) : (
            <div className="flex gap-1.5">
              <input
                type="text"
                value={promotionGuestName}
                onChange={(e) => onChangePromotionGuestName(e.target.value)}
                placeholder="Όνομα"
                className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] outline-none focus:border-accent"
                disabled={disabled}
              />
              <button
                type="button"
                onClick={onPromoteToGuest}
                disabled={disabled || !promotionGuestName.trim()}
                className="rounded-md border border-accent bg-accent/10 px-2 py-1 text-[11px] text-accent transition hover:bg-accent/20 disabled:opacity-50"
              >
                ✓
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function ChildIndicator({
  attendee,
  childResolution,
  disabled,
  onToggleChild,
}: {
  attendee: AttendeeWithMember;
  childResolution: IsChildResolution;
  disabled: boolean;
  onToggleChild: () => void;
}) {
  const { isChild, source } = childResolution;
  const memberAge = getAge(attendee.member?.birth_date ?? null);

  let glyph: string;
  if (source === "override" && !isChild) glyph = "🧑";
  else if (isChild) glyph = "👶";
  else glyph = "⚪";

  let tooltip: string;
  if (source === "unknown") {
    tooltip = "Άγνωστη ηλικία — πάτησε για: Παιδί";
  } else if (source === "auto" && !isChild) {
    tooltip = "Ενήλικας (auto) — πάτησε για: Παιδί";
  } else if (source === "auto" && isChild) {
    tooltip = `Παιδί (auto από ηλικία ${memberAge}) — πάτησε για: Manual ενήλικας`;
  } else if (source === "override" && isChild) {
    tooltip = "Παιδί (manual) — πάτησε για: Manual ενήλικας";
  } else {
    tooltip = "Ενήλικας (manual) — πάτησε για: Auto";
  }

  const faded =
    source === "unknown" || (source === "auto" && !isChild);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onToggleChild();
      }}
      onKeyDown={(e) => e.stopPropagation()}
      title={tooltip}
      aria-label={tooltip}
      className={`shrink-0 text-sm leading-none transition disabled:opacity-50 ${
        faded ? "opacity-40 hover:opacity-80" : ""
      }`}
    >
      {glyph}
    </button>
  );
}

function ModeRadio({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5">
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        className="h-3 w-3 accent-accent"
      />
      <span>{label}</span>
    </label>
  );
}

function ModalShell({
  title,
  children,
  onClose,
  headerAction,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  headerAction?: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <div className="flex items-center gap-1">
            {headerAction}
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-muted transition hover:bg-background"
              aria-label="Κλείσιμο"
            >
              ✕
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
