/**
 * Date bucket helpers για grouping audit entries (ή άλλα timeline data)
 * σε date sections με user-friendly labels.
 *
 * Critical: Αθηνική timezone awareness — entries γύρω από UTC midnight
 * (02:00-03:00 Athens) θα κατατάσσονταν λάθος σε UTC date boundaries.
 *
 * Helper paired με τα existing relative-date utilities — όχι replacement.
 * Relative ("πριν 3 ώρες") παραμένει useful per-entry display,
 * date bucket είναι για section grouping.
 */

const ATHENS_TZ = "Europe/Athens";

/**
 * Extract a stable date key (YYYY-MM-DD σε Athens local time) από
 * έναν ISO timestamp. Suitable για grouping (Map key) ή sorting.
 */
export function toAthensDateKey(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  // Use sv-SE locale to get YYYY-MM-DD format from toLocaleDateString
  // με explicit Athens timezone
  return date.toLocaleDateString("sv-SE", {
    timeZone: ATHENS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

/**
 * Format a date key (YYYY-MM-DD από toAthensDateKey) σε user-friendly
 * Greek label:
 * - "Σήμερα — DD/MM/YYYY" για σημερινή μέρα
 * - "Χθες — DD/MM/YYYY" για χθεσινή μέρα
 * - "DD/MM/YYYY" για παλαιότερες μέρες
 *
 * Comparison γίνεται σε Athens timezone — αν user γράφει σε
 * 23:45 σε Athens, η entry εμφανίζεται στο σημερινό bucket
 * (όχι στο "χθες" σαν τη UTC interpretation).
 */
export function formatDateBucketLabel(dateKey: string): string {
  const todayKey = toAthensDateKey(new Date().toISOString());
  const yesterdayKey = toAthensDateKey(
    new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  );

  // Convert YYYY-MM-DD → DD/MM/YYYY για display
  const [year, month, day] = dateKey.split("-");
  const formatted = `${day}/${month}/${year}`;

  if (dateKey === todayKey) return `Σήμερα — ${formatted}`;
  if (dateKey === yesterdayKey) return `Χθες — ${formatted}`;
  return formatted;
}
