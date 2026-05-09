export type VerificationState =
  | "no_email"
  | "never_sent"
  | "pending"
  | "expired"
  | "verified";

export function getVerificationState(member: {
  email: string | null;
  email_verified: boolean | null;
  email_verification_sent_at: string | null;
  email_verification_expires_at: string | null;
  email_verified_at: string | null;
}): VerificationState {
  if (!member.email) return "no_email";
  if (member.email_verified === true) return "verified";
  if (member.email_verification_sent_at == null) return "never_sent";
  if (member.email_verification_expires_at != null) {
    const expiresAt = new Date(member.email_verification_expires_at);
    if (expiresAt <= new Date()) return "expired";
  }
  return "pending";
}

export function formatRelativeDate(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";

  const now = new Date();
  const diffMs = now.getTime() - then.getTime();
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHour = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHour / 24);

  if (diffMin < 1) return "μόλις τώρα";
  if (diffMin < 60) return diffMin === 1 ? "πριν 1 λεπτό" : `πριν ${diffMin} λεπτά`;
  if (diffHour < 24) return diffHour === 1 ? "πριν 1 ώρα" : `πριν ${diffHour} ώρες`;

  const sameDay =
    then.getFullYear() === now.getFullYear() &&
    then.getMonth() === now.getMonth() &&
    then.getDate() === now.getDate();
  if (sameDay) return "σήμερα";
  if (diffDay === 1) return "χθες";
  if (diffDay < 30) return `πριν ${diffDay} μέρες`;

  const diffMonth = Math.round(diffDay / 30);
  if (diffMonth < 12) return diffMonth === 1 ? "πριν 1 μήνα" : `πριν ${diffMonth} μήνες`;

  const diffYear = Math.round(diffDay / 365);
  return diffYear === 1 ? "πριν 1 χρόνο" : `πριν ${diffYear} χρόνια`;
}
