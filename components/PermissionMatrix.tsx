"use client";

import type { ReactNode } from "react";
import type {
  MemberPermission,
  PermissionAction,
  PermissionModule,
  PermissionScope,
} from "@/lib/supabase/types";

// ─────────── Types ───────────

export type CellState = {
  enabled: boolean;
  scope: PermissionScope;
  scope_value: string;
};

const EMPTY_CELL: CellState = {
  enabled: false,
  scope: "all",
  scope_value: "",
};

export type CellKey = `${PermissionModule}:${PermissionAction}`;

export type MatrixState = Map<CellKey, CellState>;

// ─────────── Constants ───────────

export const MODULES: Array<{ id: PermissionModule; label: string }> = [
  { id: "calendar", label: "Ημερολόγιο" },
  { id: "members", label: "Μέλη" },
  { id: "finances", label: "Οικονομικά" },
  { id: "cashier", label: "Ταμείο" },
  { id: "seating", label: "Πλάνο Τραπεζιών" },
  { id: "events", label: "Εκδηλώσεις" },
  { id: "dashboard", label: "Dashboard" },
  { id: "settings", label: "Ρυθμίσεις" },
];

export const ACTIONS: Array<{ id: PermissionAction; label: string }> = [
  { id: "read", label: "Ανάγνωση" },
  { id: "create", label: "Δημιουργία" },
  { id: "edit", label: "Επεξεργασία" },
  { id: "delete", label: "Διαγραφή" },
];

// ─────────── Helpers ───────────

export function cellKey(
  module: PermissionModule,
  action: PermissionAction
): CellKey {
  return `${module}:${action}` as CellKey;
}

export function buildEmptyMatrix(): MatrixState {
  const map: MatrixState = new Map();
  for (const m of MODULES) {
    for (const a of ACTIONS) {
      map.set(cellKey(m.id, a.id), { ...EMPTY_CELL });
    }
  }
  return map;
}

export function rowsToMatrix(rows: MemberPermission[]): MatrixState {
  const map = buildEmptyMatrix();
  for (const r of rows) {
    map.set(cellKey(r.module, r.action), {
      enabled: true,
      scope: r.scope,
      scope_value: r.scope_value ?? "",
    });
  }
  return map;
}

// ─────────── CellEditor ───────────

const inputClass =
  "w-full rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

export function CellEditor({
  cell,
  onChange,
  disabled = false,
}: {
  cell: CellState;
  onChange: (patch: Partial<CellState>) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col items-stretch gap-1">
      <label className="flex items-center justify-center gap-1">
        <input
          type="checkbox"
          checked={cell.enabled}
          disabled={disabled}
          onChange={(e) => onChange({ enabled: e.target.checked })}
          className="h-4 w-4 rounded border-border"
        />
      </label>
      {cell.enabled && (
        <>
          <select
            value={cell.scope}
            disabled={disabled}
            onChange={(e) =>
              onChange({ scope: e.target.value as PermissionScope })
            }
            className={inputClass}
          >
            <option value="all">Όλα</option>
            <option value="own">Δικά μου</option>
            <option value="department">Τμήμα</option>
          </select>
          {cell.scope === "department" && (
            <input
              type="text"
              value={cell.scope_value}
              disabled={disabled}
              onChange={(e) => onChange({ scope_value: e.target.value })}
              placeholder="π.χ. Χορευτικό"
              className={inputClass}
            />
          )}
        </>
      )}
    </div>
  );
}

// ─────────── PermissionMatrix ───────────

export function PermissionMatrix({
  matrix,
  onChange,
  readOnly = false,
  title,
  subtitle,
}: {
  matrix: MatrixState;
  onChange: (next: MatrixState) => void;
  readOnly?: boolean;
  title?: string;
  subtitle?: ReactNode;
}) {
  function updateCell(
    module: PermissionModule,
    action: PermissionAction,
    patch: Partial<CellState>
  ) {
    const next = new Map(matrix);
    const k = cellKey(module, action);
    const current = next.get(k) ?? { ...EMPTY_CELL };
    next.set(k, { ...current, ...patch });
    onChange(next);
  }

  return (
    <div>
      {(title || subtitle) && (
        <div className="mb-4">
          {title && <h2 className="text-lg font-semibold">{title}</h2>}
          {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-background/50 text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="px-3 py-2">Ενότητα</th>
              {ACTIONS.map((a) => (
                <th key={a.id} className="px-3 py-2 text-center">
                  {a.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {MODULES.map((mod) => (
              <tr key={mod.id}>
                <td className="px-3 py-2 font-medium">{mod.label}</td>
                {ACTIONS.map((a) => {
                  const cell =
                    matrix.get(cellKey(mod.id, a.id)) ?? EMPTY_CELL;
                  return (
                    <td
                      key={a.id}
                      className="px-3 py-2 align-top text-center"
                    >
                      <CellEditor
                        cell={cell}
                        disabled={readOnly}
                        onChange={(patch) => updateCell(mod.id, a.id, patch)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11px] text-muted">
        Scope: <strong>Όλα</strong> = πρόσβαση παντού,{" "}
        <strong>Δικά μου</strong> = μόνο records που του ανήκουν,{" "}
        <strong>Τμήμα</strong> = μόνο records του συγκεκριμένου τμήματος
        (συμπληρώστε όνομα).
      </p>
    </div>
  );
}
