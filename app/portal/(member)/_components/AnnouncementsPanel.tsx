import type { Member } from "@/lib/supabase/types";
import {
  getRecentAnnouncements,
  getUnreadCount,
  getTotalCount,
} from "@/lib/portal/announcements";
import { AnnouncementsPanelView } from "./AnnouncementsPanelView";

/**
 * Server component: φέρνει announcements + counts και τα περνάει στο
 * client view που χειρίζεται την collapse state.
 *
 * limit default = 10 (αρκετά ώστε ο user να βλέπει συνήθη όγκο όταν
 * expand-άρει, αλλά πάνω κάτω fits το παραθυράκι χωρίς υπερβολικό scroll).
 */
export default async function AnnouncementsPanel({
  member,
  limit = 10,
}: {
  member: Member;
  limit?: number;
}) {
  const [announcements, unreadCount, totalCount] = await Promise.all([
    getRecentAnnouncements(member, limit),
    getUnreadCount(member),
    getTotalCount(member),
  ]);

  return (
    <AnnouncementsPanelView
      announcements={announcements}
      unreadCount={unreadCount}
      totalCount={totalCount}
    />
  );
}
