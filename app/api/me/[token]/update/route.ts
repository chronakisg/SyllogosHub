import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { computeChanges, logChange, logEmailVerified } from '@/lib/audit/log';

// Whitelist των fields που επιτρέπεται να ενημερώνει το μέλος
const ALLOWED_FIELDS = [
  'phone',
  'birth_date',
  'birthplace',
  'residence',
  'address',
  'occupation',
  'father_name',
  'mother_name',
  'maiden_name',
] as const;

type AllowedField = typeof ALLOWED_FIELDS[number];

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  const supabase = await getServerClient();

  // 1. Parse body
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // 2. Lookup member by token (validate token)
  const { data: member, error: memberError } = await supabase
    .from('members')
    .select(`
      id,
      club_id,
      email_verification_expires_at,
      email_verified,
      phone,
      birth_date,
      birthplace,
      residence,
      address,
      occupation,
      father_name,
      mother_name,
      maiden_name
    `)
    .eq('email_verification_token', token)
    .maybeSingle();

  if (memberError || !member) {
    return NextResponse.json(
      { error: 'Ο σύνδεσμος δεν είναι έγκυρος ή έχει λήξει' },
      { status: 404 }
    );
  }

  // 3. Check expiry
  if (member.email_verification_expires_at) {
    const expiresAt = new Date(member.email_verification_expires_at);
    if (expiresAt < new Date()) {
      return NextResponse.json(
        { error: 'Ο σύνδεσμος έχει λήξει' },
        { status: 404 }
      );
    }
  }

  // 4. Filter μόνο τα allowed fields
  const updates: Record<string, string | null> = {};
  for (const field of ALLOWED_FIELDS) {
    if (field in body) {
      const value = body[field];
      if (value === null || value === undefined || value === '') {
        updates[field] = null;
      } else if (typeof value === 'string') {
        updates[field] = value.trim();
      }
    }
  }

  // 5. Update member + set email_verified = true
  const { error: updateError } = await supabase
    .from('members')
    .update({
      ...updates,
      email_verified: true,
      email_verified_at: new Date().toISOString(),
    })
    .eq('id', member.id);

  if (updateError) {
    return NextResponse.json(
      { error: 'Σφάλμα αποθήκευσης: ' + updateError.message },
      { status: 500 }
    );
  }

  // Audit log: καταγραφή των αλλαγών (fail-soft)
  if (member.club_id) {
    const before = member as unknown as Record<string, unknown>;
    const after = { ...before, ...updates };
    const changes = computeChanges(
      before,
      after,
      [...ALLOWED_FIELDS],
    );
    await logChange({
      clubId: member.club_id,
      tableName: 'members',
      recordId: member.id,
      action: 'update',
      actorLabel: 'self_via_token',
      actorMemberId: member.id,
      changes,
    });

    // Email verification audit (discriminated event)
    // Idempotency strategy: αντί να ελέγχουμε το members.email_verified
    // boolean (which can be true από pre-hook era ή backfill χωρίς
    // αντίστοιχη audit entry), ψάχνουμε για existing REAL audit entry
    // (actor_label != 'system') — backfill entries δεν εμποδίζουν τη
    // καταγραφή πραγματικής verification ενέργειας.
    //
    // RLS off στο audit_log table — server client adequate για read.
    // Αν RLS γίνει aggressive μελλοντικά, switch σε getAdminClient.
    const { data: existingRealEntry } = await supabase
      .from('audit_log')
      .select('id')
      .eq('record_id', member.id)
      .eq('action', 'email_verified')
      .neq('actor_label', 'system')
      .limit(1)
      .maybeSingle();

    if (!existingRealEntry) {
      await logEmailVerified({
        clubId: member.club_id,
        memberId: member.id,
        actorLabel: 'self_via_token',
        actorMemberId: member.id,
        previousValue: member.email_verified,
        notes: null,
      });
    }
  }

  return NextResponse.json({ success: true });
}
