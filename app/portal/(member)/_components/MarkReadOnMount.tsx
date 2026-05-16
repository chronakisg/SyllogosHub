'use client';

import { useEffect } from 'react';

/**
 * Side-effect-only client component που σηματοδοτεί στο server ότι
 * ο member είδε τις τρέχουσες ανακοινώσεις (ενημερώνει το
 * members.last_announcement_check_at).
 *
 * Mount-once per page load. Σιωπηλή αποτυχία — αν το fetch αποτύχει,
 * ο badge θα ξαναεμφανιστεί στο επόμενο visit (self-healing).
 *
 * Renders null — καθαρή client effect, no UI.
 */
export function MarkReadOnMount() {
  useEffect(() => {
    fetch('/api/portal/announcements/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => {
      // Silent fail — non-critical UX path.
    });
  }, []);

  return null;
}
