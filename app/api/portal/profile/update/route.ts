import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { getCurrentMember } from '@/lib/auth/portalAuth';

const ALLOWED_FIELDS = [
  'phone',
  'birth_date',
  'address',
  'occupation',
  'father_name',
  'mother_name',
  'maiden_name',
] as const;

type AllowedField = (typeof ALLOWED_FIELDS)[number];
type UpdatePayload = Partial<Record<AllowedField, string | null>>;

export async function POST(request: Request) {
  // 1. Auth check
  const member = await getCurrentMember();
  if (!member) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Parse body
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  // 3. Whitelist filter
  const updates: UpdatePayload = {};
  for (const key of ALLOWED_FIELDS) {
    if (key in body) {
      const value = body[key];
      if (value === null || typeof value === 'string') {
        updates[key] = value;
      } else {
        return NextResponse.json(
          { error: `Field ${key} must be string or null` },
          { status: 400 }
        );
      }
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: 'Καμία αλλαγή για αποθήκευση' },
      { status: 400 }
    );
  }

  // 4. Update via session client
  const supabase = await getServerClient();
  const { data: updated, error } = await supabase
    .from('members')
    .update(updates)
    .eq('id', member.id)
    .select('*')
    .single();

  if (error || !updated) {
    console.error('Profile update failed:', error);
    return NextResponse.json(
      { error: 'Σφάλμα αποθήκευσης' },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, member: updated });
}
