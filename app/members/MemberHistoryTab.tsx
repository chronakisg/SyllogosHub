"use client";

import { useEffect, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import type { AuditLog } from "@/lib/supabase/types";
import {
  getFieldLabel,
  getActorLabel,
  formatAuditValue,
  MEMBER_AUDIT_FIELD_ORDER,
} from "@/lib/audit/labels";
import { formatRelativeDate } from "@/lib/utils/verificationState";

type Props = {
  memberId: string;
  clubId: string;
};

type Status = "loading" | "ready" | "error";

export function MemberHistoryTab({ memberId, clubId }: Props) {
  const [entries, setEntries] = useState<AuditLog[]>([]);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let cancelled = false;

    async function fetchHistory() {
      const supabase = getBrowserClient();
      const { data, error } = await supabase
        .from("audit_log")
        .select("*")
        .eq("club_id", clubId)
        .eq("table_name", "members")
        .eq("record_id", memberId)
        .order("created_at", { ascending: false })
        .limit(20);

      if (cancelled) return;

      if (error) {
        console.error("[audit_history] fetch failed:", error);
        setStatus("error");
        return;
      }

      setEntries((data ?? []) as AuditLog[]);
      setStatus("ready");
    }

    fetchHistory();
    return () => {
      cancelled = true;
    };
  }, [memberId, clubId]);

  if (status === "loading") {
    return (
      <p className="py-8 text-center text-sm text-muted">Φόρτωση…</p>
    );
  }

  if (status === "error") {
    return (
      <p className="py-8 text-center text-sm text-red-600">
        Σφάλμα φόρτωσης ιστορικού
      </p>
    );
  }

  if (entries.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted">
        Δεν υπάρχει ιστορικό αλλαγών
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <AuditEntryCard key={entry.id} entry={entry} />
      ))}
    </div>
  );
}

function AuditEntryCard({ entry }: { entry: AuditLog }) {
  const relativeLabel = formatRelativeDate(entry.created_at);
  const absoluteLabel = new Date(entry.created_at).toLocaleString("el-GR");
  const actorLabel = getActorLabel(entry.actor_label);

  // Sort changes με MEMBER_AUDIT_FIELD_ORDER για consistent UX
  const sortedEntries = Object.entries(entry.changes).sort(([a], [b]) => {
    const indexA = MEMBER_AUDIT_FIELD_ORDER.indexOf(a);
    const indexB = MEMBER_AUDIT_FIELD_ORDER.indexOf(b);
    return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
  });

  return (
    <div className="rounded-lg border border-border bg-surface p-3 text-sm">
      <div className="mb-2 flex items-center justify-between text-xs text-muted">
        <span title={absoluteLabel}>{relativeLabel}</span>
        <span className="font-medium">{actorLabel}</span>
      </div>
      <div className="space-y-1">
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
      <span className="text-muted">{formatAuditValue(change.from)}</span>
      <span className="text-muted">→</span>
      <span>{formatAuditValue(change.to)}</span>
    </div>
  );
}
