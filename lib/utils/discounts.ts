import type {
  DiscountContext,
  DiscountRule,
  Member,
} from "@/lib/supabase/types";

export function calculateAge(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

export function countChildrenInFamily(
  familyMembers: Member[],
  cutoffAge = 18
): Member[] {
  return familyMembers
    .filter((m) => {
      const age = calculateAge(m.birth_date);
      return age != null && age < cutoffAge;
    })
    .sort((a, b) => {
      const ad = a.birth_date ?? "";
      const bd = b.birth_date ?? "";
      return ad.localeCompare(bd);
    });
}

export function getSiblingPosition(
  member: Member,
  familyMembers: Member[]
): number | null {
  if (!member.family_id) return null;
  const age = calculateAge(member.birth_date);
  if (age == null || age >= 18) return null;
  const children = countChildrenInFamily(familyMembers);
  const idx = children.findIndex((c) => c.id === member.id);
  return idx === -1 ? null : idx + 1;
}

export type DiscountResult = {
  originalAmount: number;
  finalAmount: number;
  discountPercent: number;
  appliedRule: DiscountRule | null;
  ruleLabel: string | null;
};

export function calculateDiscount(input: {
  member: Member;
  family: Member[];
  baseAmount: number;
  context: DiscountContext;
  rules: DiscountRule[];
}): DiscountResult {
  const { member, family, baseAmount, context, rules } = input;
  const active = rules.filter((r) => r.context === context && r.active);
  const noDiscount: DiscountResult = {
    originalAmount: baseAmount,
    finalAmount: baseAmount,
    discountPercent: 0,
    appliedRule: null,
    ruleLabel: null,
  };

  // 1. Try sibling_order rules first
  const position = getSiblingPosition(member, family);
  if (position != null) {
    const siblingRules = active
      .filter(
        (r) =>
          r.rule_type === "sibling_order" &&
          r.sibling_position != null &&
          r.sibling_position <= position
      )
      .sort(
        (a, b) => (b.sibling_position ?? 0) - (a.sibling_position ?? 0)
      );
    if (siblingRules[0]) {
      const r = siblingRules[0];
      const finalAmount = round2(
        baseAmount * (1 - r.discount_percent / 100)
      );
      return {
        originalAmount: baseAmount,
        finalAmount,
        discountPercent: r.discount_percent,
        appliedRule: r,
        ruleLabel: r.label,
      };
    }
  }

  // 2. Fall back to age_based rules
  const age = calculateAge(member.birth_date);
  if (age != null) {
    const ageRules = active
      .filter(
        (r) =>
          r.rule_type === "age_based" &&
          r.age_max != null &&
          age <= r.age_max
      )
      .sort((a, b) => (a.age_max ?? 0) - (b.age_max ?? 0));
    if (ageRules[0]) {
      const r = ageRules[0];
      const finalAmount = round2(
        baseAmount * (1 - r.discount_percent / 100)
      );
      return {
        originalAmount: baseAmount,
        finalAmount,
        discountPercent: r.discount_percent,
        appliedRule: r,
        ruleLabel: r.label,
      };
    }
  }

  return noDiscount;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function generateUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback v4-ish
  const r = Math.random;
  const hex = (n: number) =>
    Math.floor(r() * 16 ** n)
      .toString(16)
      .padStart(n, "0");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-8${hex(3)}-${hex(12)}`;
}
