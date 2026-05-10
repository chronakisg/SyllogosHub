import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  const supabase = await getServerClient();

  // Lookup member by token
  const { data: member, error } = await supabase
    .from('members')
    .select(`
      id,
      first_name,
      last_name,
      email,
      phone,
      birth_date,
      address,
      occupation,
      father_name,
      mother_name,
      maiden_name,
      birthplace,
      residence,
      email_verification_expires_at,
      club_id
    `)
    .eq('email_verification_token', token)
    .maybeSingle();

  if (error || !member) {
    return NextResponse.json(
      { error: 'Ο σύνδεσμος δεν είναι έγκυρος ή έχει λήξει' },
      { status: 404 }
    );
  }

  // Check expiry
  if (member.email_verification_expires_at) {
    const expiresAt = new Date(member.email_verification_expires_at);
    if (expiresAt < new Date()) {
      return NextResponse.json(
        { error: 'Ο σύνδεσμος έχει λήξει' },
        { status: 404 }
      );
    }
  }

  if (!member.club_id) {
    return NextResponse.json(
      { error: 'Member not linked to club' },
      { status: 500 }
    );
  }

  // Fetch club info για το branding/header
  const [clubResult, settingsResult] = await Promise.all([
    supabase.from('clubs').select('id, name').eq('id', member.club_id).single(),
    supabase
      .from('club_settings')
      .select('logo_url, primary_color')
      .eq('club_id', member.club_id)
      .maybeSingle(),
  ]);

  return NextResponse.json({
    member: {
      first_name: member.first_name,
      last_name: member.last_name,
      email: member.email,
      phone: member.phone,
      birth_date: member.birth_date,
      address: member.address,
      occupation: member.occupation,
      father_name: member.father_name,
      mother_name: member.mother_name,
      maiden_name: member.maiden_name,
      birthplace: member.birthplace,
      residence: member.residence,
    },
    club: clubResult.data ? {
      name: clubResult.data.name,
      logo_url: settingsResult.data?.logo_url ?? null,
      primary_color: settingsResult.data?.primary_color ?? '#800000',
    } : null,
    expires_at: member.email_verification_expires_at,
  });
}
