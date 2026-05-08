import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';

// Whitelist των fields που επιτρέπεται να ενημερώνει το μέλος
const ALLOWED_FIELDS = [
  'phone',
  'birth_date',
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
    .select('id, email_verification_expires_at')
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

  return NextResponse.json({ success: true });
}
