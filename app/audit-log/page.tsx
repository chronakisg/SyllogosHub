"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useRole } from "@/lib/hooks/useRole";
import { getBrowserClient } from "@/lib/supabase/client";
import type { AuditLog } from "@/lib/supabase/types";
import { getFieldLabel, getActorLabel } from "@/lib/audit/labels";
import { formatRelativeDate } from "@/lib/utils/verificationState";
import { normalizeGreek } from "@/lib/utils/greekSearch";
import { toAthensDateKey, formatDateBucketLabel } from "@/lib/utils/dateBuckets";

type MemberInfo = {
  id: string;
  first_name: string;
  last_name: string;
};

type Status = "loading" | "ready" | "error" | "denied";

const FIELD_ORDER = [
  "phone",
  "birth_date",
  "birthplace",
  "residence",
  "address",
  "occupation",
  "father_name",
  "mother_name",
  "maiden_name",
];

const DAYS_WINDOW = 15; // hardcoded για skeleton, dropdown σε Commit 6
const FETCH_LIMIT = 100;

export default function AuditLogPage() {
  const router = useRouter();
  const { permissions, loading: roleLoading } = useRole();
  const [entries, setEntries] = useState<AuditLog[]>([]);
  const [memberMap, setMemberMap] = useState<Map<string, MemberInfo>>(new Map());
  const [status, setStatus] = useState<Status>("loading");
  const [search, setSearch] = useState("");

  // Permission gate
  useEffect(() => {
    if (roleLoading) return;
    if (!permissions.includes("audit")) {
      setStatus("denied");
    }
  }, [permissions, roleLoading]);

  // Fetch data
  useEffect(() => {
    if (status === "denied") return;
    if (roleLoading) return;
    if (!permissions.includes("audit")) return;

    let cancelled = false;

    async function fetchData() {
      const supabase = getBrowserClient();

      // Calculate cutoff: 15 days ago
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - DAYS_WINDOW);

      // Query 1: audit_log entries
      const { data: auditData, error: auditError } = await supabase
        .from("audit_log")
        .select("*")
        .eq("table_name", "members")
        .gte("created_at", cutoff.toISOString())
        .order("created_at", { ascending: false })
        .limit(FETCH_LIMIT);

      if (cancelled) return;

      if (auditError) {
        console.error("[audit_log_page] fetch failed:", auditError);
        setStatus("error");
        return;
      }

      const auditEntries = (auditData ?? []) as AuditLog[];

      // Query 2: fetch member names
      const memberIds = [...new Set(auditEntries.map((e) => e.record_id))];

      if (memberIds.length === 0) {
        setEntries([]);
        setMemberMap(new Map());
        setStatus("ready");
        return;
      }

      const { data: membersData, error: membersError } = await supabase
        .from("members")
        .select("id, first_name, last_name")
        .in("id", memberIds);

      if (cancelled) return;

      if (membersError) {
        console.error("[audit_log_page] members fetch failed:", membersError);
        setStatus("error");
        return;
      }

      const map = new Map<string, MemberInfo>();
      (membersData ?? []).forEach((m) => {
        map.set(m.id, m as MemberInfo);
      });

      setEntries(auditEntries);
      setMemberMap(map);
      setStatus("ready");
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [permissions, roleLoading, status]);

  // Group entries by Athens-local date, then by member within each date
  const dateSections = useMemo(() => {
    const normalizedSearch = normalizeGreek(search.trim());

    // Step A: Filter entries by member name search (member-level filter)
    const filteredEntries = !normalizedSearch
      ? entries
      : entries.filter((entry) => {
          const member = memberMap.get(entry.record_id);
          if (!member) return false;
          const haystack = normalizeGreek(
            `${member.last_name} ${member.first_name}`
          );
          return haystack.includes(normalizedSearch);
        });

    // Step B: Group by Athens-local date key
    const byDate = new Map<string, AuditLog[]>();
    for (const entry of filteredEntries) {
      const dateKey = toAthensDateKey(entry.created_at);
      const list = byDate.get(dateKey) ?? [];
      list.push(entry);
      byDate.set(dateKey, list);
    }

    // Step C: Within each date bucket, sub-group by member
    // (preserve existing newest-first ordering of entries — από server)
    const sections = [...byDate.entries()].map(([dateKey, dateEntries]) => {
      const byMember = new Map<string, AuditLog[]>();
      for (const entry of dateEntries) {
        const list = byMember.get(entry.record_id) ?? [];
        list.push(entry);
        byMember.set(entry.record_id, list);
      }

      // Sort members within bucket: alphabetical by last_name (Greek)
      const members = [...byMember.entries()].sort(([idA], [idB]) => {
        const a = memberMap.get(idA);
        const b = memberMap.get(idB);
        if (!a || !b) return 0;
        return a.last_name.localeCompare(b.last_name, "el", {
          sensitivity: "base",
        });
      });

      return { dateKey, members };
    });

    // Step D: Sort date buckets — newest date first
    // (YYYY-MM-DD strings sort chronologically, reverse for descending)
    sections.sort((a, b) => b.dateKey.localeCompare(a.dateKey));

    return sections;
  }, [entries, memberMap, search]);

  // Permission denied
  if (status === "denied") {
    return (
      <div className="mx-auto w-full max-w-7xl p-4">
        <p className="py-8 text-center text-sm text-muted">
          Δεν έχετε πρόσβαση σε αυτή τη σελίδα.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl p-4">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Ιστορικό αλλαγών
        </h1>
        <p className="mt-1 text-sm text-muted">
          Αλλαγές στα στοιχεία μελών τις τελευταίες {DAYS_WINDOW} ημέρες.
        </p>
      </header>

      <div className="mb-6">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Αναζήτηση μέλους…"
          className="w-full max-w-md rounded-lg border border-border bg-surface px-4 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
      </div>

      {status === "loading" && (
        <p className="py-8 text-center text-sm text-muted">Φόρτωση…</p>
      )}

      {status === "error" && (
        <p className="py-8 text-center text-sm text-red-600">
          Σφάλμα φόρτωσης ιστορικού
        </p>
      )}

      {status === "ready" && dateSections.length === 0 && (
        <p className="py-8 text-center text-sm text-muted">
          Δεν υπάρχει ιστορικό αλλαγών
        </p>
      )}

      {status === "ready" && dateSections.length > 0 && (
        <div className="space-y-8">
          {dateSections.map(({ dateKey, members }) => (
            <section key={dateKey} className="space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                {formatDateBucketLabel(dateKey)}
              </h2>
              {members.map(([memberId, memberEntries]) => {
                const member = memberMap.get(memberId);
                if (!member) return null;
                return (
                  <MemberAuditGroup
                    key={`${dateKey}-${memberId}`}
                    member={member}
                    entries={memberEntries}
                  />
                );
              })}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function MemberAuditGroup({
  member,
  entries,
}: {
  member: MemberInfo;
  entries: AuditLog[];
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h3 className="mb-3 flex items-baseline gap-2 font-semibold">
        <span>
          {member.last_name} {member.first_name}
        </span>
        <span className="text-xs font-normal text-muted">
          ({entries.length} {entries.length === 1 ? "αλλαγή" : "αλλαγές"})
        </span>
      </h3>
      <div className="space-y-2">
        {entries.map((entry) => (
          <AuditEntryRow key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  );
}

function AuditEntryRow({ entry }: { entry: AuditLog }) {
  const date = new Date(entry.created_at);
  const relativeLabel = formatRelativeDate(entry.created_at);
  const absoluteLabel = date.toLocaleString("el-GR");
  const actorLabel = getActorLabel(entry.actor_label);

  // Sort changes με FIELD_ORDER
  const sortedEntries = Object.entries(entry.changes).sort(([a], [b]) => {
    const indexA = FIELD_ORDER.indexOf(a);
    const indexB = FIELD_ORDER.indexOf(b);
    return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
  });

  return (
    <div className="rounded border border-border/50 bg-background p-2 text-sm">
      <div className="mb-1 flex items-center justify-between text-xs text-muted">
        <span title={absoluteLabel}>{relativeLabel}</span>
        <span className="font-medium">{actorLabel}</span>
      </div>
      <div className="space-y-0.5">
        {sortedEntries.map(([field, change]) => (
          <FieldChange
            key={field}
            field={field}
            change={change as { from: unknown; to: unknown }}
          />
        ))}
      </div>
    </div>
  );
}

function FieldChange({
  field,
  change,
}: {
  field: string;
  change: { from: unknown; to: unknown };
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-1">
      <span className="font-medium">{getFieldLabel(field)}:</span>
      <span className="text-muted">{formatValue(change.from)}</span>
      <span className="text-muted">→</span>
      <span>{formatValue(change.to)}</span>
    </div>
  );
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined || val === "") {
    return "(κενό)";
  }
  return String(val);
}
