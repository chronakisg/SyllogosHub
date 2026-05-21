import { getAdminClient } from "@/lib/supabase/admin";
import type { Announcement, Member } from "@/lib/supabase/types";

/**
 * Announcement εμπλουτισμένο με flag για το αν είναι νέο για τον member
 * (created_at μεταγενέστερο του last_announcement_check_at).
 */
export type AnnouncementWithMeta = Announcement & {
  is_new: boolean;
};

const EPOCH = "1970-01-01T00:00:00Z";

/**
 * Aggregate audience-relevance context για member: ποιες audience types
 * δικαιολογούν να βλέπει ανακοινώσεις.
 */
type MemberAudienceContext = {
  isBoard: boolean;
  isLeader: boolean;
  deptIds: string[];
};

async function getMemberAudienceContext(
  member: Member
): Promise<MemberAudienceContext> {
  const admin = getAdminClient();

  // Member's own departments (via member_departments — for audience='department')
  const memberDeptsRes = await admin
    .from("member_departments")
    .select("department_id")
    .eq("member_id", member.id);

  const deptIds = memberDeptsRes.error
    ? []
    : (memberDeptsRes.data ?? []).map((r) => r.department_id);

  // Leader/assistant status (via department_leaders — for audience='leaders')
  const leaderRes = await admin
    .from("department_leaders")
    .select("member_id")
    .eq("member_id", member.id)
    .limit(1);

  const isLeader = leaderRes.error
    ? false
    : (leaderRes.data ?? []).length > 0;

  return {
    isBoard: member.is_board_member,
    isLeader,
    deptIds,
  };
}

/**
 * Επιστρέφει τα announcement_ids που είναι ορατά στον member βάσει
 * audience matching:
 *   - global → πάντα
 *   - board → if member.is_board_member
 *   - leaders → if member has row σε department_leaders
 *   - department X → if X ∈ member's departments
 */
async function getVisibleAnnouncementIds(
  clubId: string,
  ctx: MemberAudienceContext
): Promise<Set<string>> {
  const admin = getAdminClient();
  const visible = new Set<string>();

  // Fetch all audience rows για το club (filter via club_id JOIN με announcements)
  const { data, error } = await admin
    .from("announcement_audiences")
    .select(
      "announcement_id, audience_type, department_id, announcements!inner(club_id, published)"
    )
    .eq("announcements.club_id", clubId)
    .eq("announcements.published", true);

  if (error) {
    console.error("getVisibleAnnouncementIds failed:", error);
    return visible;
  }

  for (const row of data ?? []) {
    const t = row.audience_type as string;
    const annId = row.announcement_id as string;
    if (t === "global") {
      visible.add(annId);
    } else if (t === "board" && ctx.isBoard) {
      visible.add(annId);
    } else if (t === "leaders" && ctx.isLeader) {
      visible.add(annId);
    } else if (
      t === "department" &&
      row.department_id &&
      ctx.deptIds.includes(row.department_id as string)
    ) {
      visible.add(annId);
    }
  }
  return visible;
}

/**
 * Επιστρέφει τα N πιο πρόσφατα δημοσιευμένα announcements που αφορούν
 * τον συγκεκριμένο member βάσει audience matching (announcement_audiences).
 *
 * Audience semantic: union of (global ∪ board-if-applicable ∪
 * leaders-if-applicable ∪ member's department announcements).
 * Ordering: pinned πρώτα, μετά created_at desc.
 *
 * Marks is_new = true αν created_at > member.last_announcement_check_at
 * (treat null check timestamp ως epoch ⇒ πάντα νέα).
 *
 * Αν ο member δεν έχει club_id (orphaned), επιστρέφει [] χωρίς query.
 */
export async function getRecentAnnouncements(
  member: Member,
  limit = 5,
): Promise<AnnouncementWithMeta[]> {
  if (!member.club_id) return [];

  const ctx = await getMemberAudienceContext(member);
  const visibleIds = await getVisibleAnnouncementIds(member.club_id, ctx);

  if (visibleIds.size === 0) return [];

  const admin = getAdminClient();
  const { data, error } = await admin
    .from("announcements")
    .select("*")
    .eq("club_id", member.club_id)
    .eq("published", true)
    .in("id", Array.from(visibleIds))
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("getRecentAnnouncements failed:", error);
    return [];
  }

  const threshold = member.last_announcement_check_at ?? EPOCH;
  return (data ?? []).map((row) => ({
    ...row,
    is_new: row.created_at > threshold,
  }));
}

/**
 * Πλήθος unread announcements για τον member (created_at > last check_at)
 * με ίδιο audience filter με το getRecentAnnouncements.
 *
 * Αν ο member δεν έχει club_id, επιστρέφει 0 χωρίς query.
 */
export async function getUnreadCount(member: Member): Promise<number> {
  if (!member.club_id) return 0;

  const ctx = await getMemberAudienceContext(member);
  const visibleIds = await getVisibleAnnouncementIds(member.club_id, ctx);

  if (visibleIds.size === 0) return 0;

  const admin = getAdminClient();
  const threshold = member.last_announcement_check_at ?? EPOCH;

  const { count, error } = await admin
    .from("announcements")
    .select("id", { count: "exact", head: true })
    .eq("club_id", member.club_id)
    .eq("published", true)
    .in("id", Array.from(visibleIds))
    .gt("created_at", threshold);

  if (error) {
    console.error("getUnreadCount failed:", error);
    return 0;
  }

  return count ?? 0;
}

/**
 * Συνολικό πλήθος δημοσιευμένων announcements που αφορούν τον member
 * (same audience filter, χωρίς timestamp). Χρησιμοποιείται στο header
 * του AnnouncementsPanel.
 */
export async function getTotalCount(member: Member): Promise<number> {
  if (!member.club_id) return 0;

  const ctx = await getMemberAudienceContext(member);
  const visibleIds = await getVisibleAnnouncementIds(member.club_id, ctx);

  return visibleIds.size;
}
