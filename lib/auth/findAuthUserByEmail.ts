import type { User } from "@supabase/auth-js";
import { getAdminClient } from "@/lib/supabase/admin";

/**
 * Lookup helpers για auth.users by email — αντικαθιστούν το ad-hoc
 * `admin.auth.admin.listUsers()` + `.find()/.some()` pattern που υπήρχε
 * σε 6 sites και είχε silent false-negative bug όταν auth.users > 50
 * (default Supabase pagination).
 *
 * Strategy: Manual pagination loop με perPage=1000 (Supabase max).
 * Σε σημερινή κλίμακα (<20 users) = 1 round-trip. Με 1000s users
 * παραμένει O(n/1000) requests — acceptable για collision/lookup paths.
 *
 * Note: Το Supabase Admin API (auth-js v2.x) δεν δέχεται email filter
 * στο listUsers, ούτε υπάρχει getUserByEmail. Η pagination είναι ο
 * μόνος επίσημος δρόμος.
 */

const PER_PAGE = 1000;
// Safety bound για να αποφύγουμε infinite loop σε pathological cases
// (π.χ. bug σε Supabase server που γυρνάει λάθος nextPage).
const MAX_ITERATIONS = 50;

/**
 * Βρίσκει auth user με case-insensitive email match. Επιστρέφει το
 * πλήρες User object (id, email, banned_until, last_sign_in_at, κλπ)
 * ή null αν δεν υπάρχει.
 *
 * @example
 * const authUser = await findAuthUserByEmail(member.email);
 * if (!authUser) return NextResponse.json({ error: "..." }, { status: 404 });
 * await admin.auth.admin.updateUserById(authUser.id, { ... });
 *
 * @throws AuthError αν το Supabase API αποτύχει
 * @throws Error αν ξεπεραστεί το MAX_ITERATIONS pagination guard
 */
export async function findAuthUserByEmail(
  email: string,
): Promise<User | null> {
  if (!email || email.trim() === "") return null;

  const target = email.toLowerCase();
  const admin = getAdminClient();

  let page = 1;
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: PER_PAGE,
    });
    if (error) throw error;

    const hit = data.users.find(
      (u) => u.email?.toLowerCase() === target,
    );
    if (hit) return hit;

    // nextPage είναι null όταν εξαντληθούν οι σελίδες
    if (!data.nextPage) return null;
    page = data.nextPage;
  }

  throw new Error(
    `findAuthUserByEmail: exceeded ${MAX_ITERATIONS} pagination iterations ` +
      `(perPage=${PER_PAGE}). Probable Supabase API bug ή >${MAX_ITERATIONS * PER_PAGE} users.`,
  );
}

/**
 * Convenience wrapper για collision-only checks (όπου δεν χρειάζεσαι
 * το User object). Internally καλεί findAuthUserByEmail.
 *
 * @example
 * if (await authEmailExists(adminEmail)) {
 *   return NextResponse.json({ error: "Email ήδη υπάρχει" }, { status: 409 });
 * }
 */
export async function authEmailExists(email: string): Promise<boolean> {
  return (await findAuthUserByEmail(email)) !== null;
}
