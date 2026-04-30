"use client";

import { getBrowserClient } from "@/lib/supabase/client";
import type {
  Entertainer,
  EntertainerInsert,
  EntertainerUpdate,
  EntertainmentType,
  EventEntertainerWithDetails,
} from "@/lib/supabase/types";

export type EntertainerWithType = Entertainer & {
  entertainment_type: EntertainmentType | null;
};

export type EventEntertainerEntry = {
  entertainer_id: string;
  fee: number | null;
  notes: string | null;
};

type EntertainerRowJoined = Entertainer & {
  entertainment_types: EntertainmentType | null;
};

type EventEntertainerRowJoined = {
  id: string;
  event_id: string;
  entertainer_id: string;
  club_id: string | null;
  fee: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  entertainers:
    | (Entertainer & {
        entertainment_types: EntertainmentType | null;
      })
    | null;
};

export async function getEntertainers(
  clubId: string
): Promise<EntertainerWithType[]> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase
    .from("entertainers")
    .select("*, entertainment_types(*)")
    .eq("club_id", clubId)
    .order("name", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as unknown as EntertainerRowJoined[];
  return rows.map((r) => ({
    ...r,
    entertainment_type: r.entertainment_types ?? null,
  }));
}

export async function createEntertainer(
  clubId: string,
  data: Omit<EntertainerInsert, "club_id">
): Promise<Entertainer> {
  const supabase = getBrowserClient();
  const name = data.name.trim();
  if (!name) {
    throw new Error("Το όνομα ψυχαγωγού είναι υποχρεωτικό.");
  }
  const { data: existing, error: qErr } = await supabase
    .from("entertainers")
    .select("id")
    .eq("club_id", clubId)
    .ilike("name", name)
    .maybeSingle();
  if (qErr) throw qErr;
  if (existing) {
    throw new Error(`Υπάρχει ήδη ψυχαγωγός με το όνομα «${name}».`);
  }
  const insert: EntertainerInsert = {
    ...data,
    name,
    club_id: clubId,
  };
  const { data: ins, error } = await supabase
    .from("entertainers")
    .insert(insert)
    .select("*")
    .single();
  if (error) throw error;
  return ins as Entertainer;
}

export async function updateEntertainer(
  id: string,
  data: EntertainerUpdate
): Promise<void> {
  const supabase = getBrowserClient();
  const patch: EntertainerUpdate = { ...data };
  if (typeof patch.name === "string") {
    patch.name = patch.name.trim();
    if (!patch.name) throw new Error("Το όνομα είναι υποχρεωτικό.");
  }
  const { error } = await supabase
    .from("entertainers")
    .update(patch)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteEntertainer(id: string): Promise<void> {
  const supabase = getBrowserClient();
  const { count, error: cErr } = await supabase
    .from("event_entertainers")
    .select("id", { count: "exact", head: true })
    .eq("entertainer_id", id);
  if (cErr) throw cErr;
  if ((count ?? 0) > 0) {
    throw new Error(
      `Δεν είναι δυνατή η διαγραφή — ο ψυχαγωγός χρησιμοποιείται σε ${count} ${
        count === 1 ? "εκδήλωση" : "εκδηλώσεις"
      }.`
    );
  }
  const { error } = await supabase.from("entertainers").delete().eq("id", id);
  if (error) throw error;
}

export async function getEventEntertainers(
  eventId: string
): Promise<EventEntertainerWithDetails[]> {
  const supabase = getBrowserClient();
  const { data, error } = await supabase
    .from("event_entertainers")
    .select(
      "*, entertainers(*, entertainment_types(*))"
    )
    .eq("event_id", eventId);
  if (error) throw error;
  const rows = (data ?? []) as unknown as EventEntertainerRowJoined[];
  return rows
    .filter((r) => !!r.entertainers)
    .map<EventEntertainerWithDetails>((r) => ({
      id: r.id,
      event_id: r.event_id,
      entertainer_id: r.entertainer_id,
      club_id: r.club_id,
      fee: r.fee,
      notes: r.notes,
      created_at: r.created_at,
      updated_at: r.updated_at,
      entertainer: {
        ...r.entertainers!,
        entertainment_type: r.entertainers!.entertainment_types ?? null,
      },
    }));
}

export async function setEventEntertainers(
  eventId: string,
  clubId: string,
  entries: EventEntertainerEntry[]
): Promise<void> {
  const supabase = getBrowserClient();
  const { error: dErr } = await supabase
    .from("event_entertainers")
    .delete()
    .eq("event_id", eventId);
  if (dErr) throw dErr;
  if (entries.length === 0) return;
  const rows = entries.map((e) => ({
    event_id: eventId,
    entertainer_id: e.entertainer_id,
    club_id: clubId,
    fee: e.fee,
    notes: e.notes,
  }));
  const { error: iErr } = await supabase
    .from("event_entertainers")
    .insert(rows);
  if (iErr) throw iErr;
}
