/**
 * Validation helpers για post-login (ή άλλο post-auth) redirect values.
 *
 * Στόχος: κλείσιμο του open redirect attack vector. Παράδειγμα:
 *   /login?redirect=https://evil.com
 * Χωρίς validation, μετά το successful login ο user navigate-άρει σε
 * attacker-controlled domain — phishing for re-entered credentials.
 *
 * Strategy: accept μόνο same-origin relative paths. Reject:
 * - non-strings (defensive)
 * - empty / null / undefined
 * - paths που δεν ξεκινούν με "/" (other origins, absolute URLs)
 * - "//<host>" (protocol-relative URL — classic open redirect bypass)
 * - paths με backslash (Windows-style path / IE-era bypass vectors)
 * - paths με CR/LF (header injection / log injection)
 *
 * No length cap — legit paths με UUIDs + query strings μπορεί να είναι
 * αρκετά long. Browser έχει δικό του URL length limit.
 */

export function isSafeRedirectPath(
  value: string | null | undefined,
): boolean {
  if (!value) return false;
  if (typeof value !== "string") return false;
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//")) return false;
  if (value.includes("\\")) return false;
  if (value.includes("\n") || value.includes("\r")) return false;
  return true;
}

/**
 * Επιστρέφει το value αν είναι safe, αλλιώς το fallback.
 *
 * @example
 * const target = sanitizeRedirect(params.get("redirect"), "/");
 * router.replace(target);
 */
export function sanitizeRedirect(
  value: string | null | undefined,
  fallback: string = "/",
): string {
  return isSafeRedirectPath(value) ? (value as string) : fallback;
}
