import { getServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import type { Database, Member } from '@/lib/supabase/types';

/**
 * Service role client — bypass RLS για admin operations.
 * Used για post-login linkage hook.
 */
function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Missing Supabase env vars για service client');
  }
  return createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Returns the currently logged-in member, or null if not authenticated
 * or if no member matches the auth user.
 */
export async function getCurrentMember(): Promise<Member | null> {
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: member } = await supabase
    .from('members')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  return member ?? null;
}

/**
 * Server-side guard για /portal/* routes.
 * Returns the member or throws (handled at page level — redirect σε /portal/login).
 */
export async function requireMember(): Promise<Member> {
  const member = await getCurrentMember();
  if (!member) {
    throw new Error('UNAUTHORIZED_NOT_MEMBER');
  }
  return member;
}

/**
 * Post-login linkage hook.
 * Called μετά από signInWithOtp success στο auth-callback.
 * Sets members.user_id αν δεν είναι ήδη set.
 * Returns the linked member or null αν δεν βρέθηκε member με αυτό το email.
 */
export async function linkAuthUserToMember(
  userId: string,
  email: string
): Promise<Member | null> {
  const admin = getServiceClient();

  // Find member by email (cross-club: future enhancement αν χρειαστεί)
  const { data: member, error: findError } = await admin
    .from('members')
    .select('*')
    .eq('email', email)
    .maybeSingle();

  if (findError || !member) {
    return null;
  }

  // Already linked — no-op
  if (member.user_id === userId) {
    return member;
  }

  // Link
  const { data: updated, error: updateError } = await admin
    .from('members')
    .update({ user_id: userId })
    .eq('id', member.id)
    .select('*')
    .single();

  if (updateError) {
    console.error('linkAuthUserToMember failed:', updateError);
    return null;
  }

  return updated;
}
