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
 * Επιστρέφει τα department_ids στα οποία ανήκει ο member.
 *
 * Χωρίς extra club_id filter στο member_departments — το authoritative
 * club scoping γίνεται downstream στο announcements query (defense in depth).
 */
async function getMemberDepartmentIds(memberId: string): Promise<string[]> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("member_departments")
    .select("department_id")
    .eq("member_id", memberId);

  if (error) {
    console.error("getMemberDepartmentIds failed:", error);
    return [];
  }

  return data?.map((row) => row.department_id) ?? [];
}

/**
 * Επιστρέφει τα N πιο πρόσφατα δημοσιευμένα announcements που αφορούν
 * τον συγκεκριμένο member.
 *
 * Audience: club-wide (department_id IS NULL) ∪ departments του member
 * (από member_departments). Ordering: pinned πρώτα, μετά created_at desc.
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

  const deptIds = await getMemberDepartmentIds(member.id);
  const admin = getAdminClient();

  let query = admin
    .from("announcements")
    .select("*")
    .eq("club_id", member.club_id)
    .eq("published", true);

  if (deptIds.length === 0) {
    query = query.is("department_id", null);
  } else {
    query = query.or(
      `department_id.is.null,department_id.in.(${deptIds.join(",")})`,
    );
  }

  const { data, error } = await query
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
 * Επιστρέφει το πλήθος των unread announcements για τον member —
 * δηλαδή announcements με created_at > last_announcement_check_at,
 * με το ίδιο audience filter που χρησιμοποιεί το getRecentAnnouncements.
 *
 * Αν ο member δεν έχει club_id (orphaned), επιστρέφει 0 χωρίς query.
 */
export async function getUnreadCount(member: Member): Promise<number> {
  if (!member.club_id) return 0;

  const deptIds = await getMemberDepartmentIds(member.id);
  const admin = getAdminClient();
  const threshold = member.last_announcement_check_at ?? EPOCH;

  let query = admin
    .from("announcements")
    .select("id", { count: "exact", head: true })
    .eq("club_id", member.club_id)
    .eq("published", true)
    .gt("created_at", threshold);

  if (deptIds.length === 0) {
    query = query.is("department_id", null);
  } else {
    query = query.or(
      `department_id.is.null,department_id.in.(${deptIds.join(",")})`,
    );
  }

  const { count, error } = await query;

  if (error) {
    console.error("getUnreadCount failed:", error);
    return 0;
  }

  return count ?? 0;
}
