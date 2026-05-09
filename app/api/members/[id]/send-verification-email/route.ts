import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { getResend, getFromEmail } from '@/lib/email/resend';
import { renderMemberVerificationEmail } from '@/lib/email/templates/memberVerification';
import { randomUUID } from 'crypto';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: memberId } = await context.params;
  const supabase = await getServerClient();

  // 1. Auth check
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Fetch member
  const { data: member, error: memberError } = await supabase
    .from('members')
    .select('id, first_name, last_name, email, club_id, email_verified')
    .eq('id', memberId)
    .single();

  if (memberError || !member) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  }

  if (!member.email) {
    return NextResponse.json(
      { error: 'Το μέλος δεν έχει καταχωρημένο email' },
      { status: 400 }
    );
  }

  if (member.email_verified) {
    return NextResponse.json(
      { error: 'Το email είναι ήδη επιβεβαιωμένο' },
      { status: 400 }
    );
  }

  if (!member.club_id) {
    return NextResponse.json(
      { error: 'Το μέλος δεν είναι συνδεδεμένο με σύλλογο' },
      { status: 400 }
    );
  }

  // 3. Fetch club + settings σε parallel
  const [clubResult, settingsResult] = await Promise.all([
    supabase.from('clubs').select('id, name').eq('id', member.club_id).single(),
    supabase
      .from('club_settings')
      .select('logo_url, primary_color')
      .eq('club_id', member.club_id)
      .maybeSingle(),
  ]);

  if (clubResult.error || !clubResult.data) {
    return NextResponse.json({ error: 'Club not found' }, { status: 404 });
  }

  const club = clubResult.data;
  const settings = settingsResult.data;

  // 4. Generate token (UUID v4)
  const token = randomUUID();
  const sentAt = new Date();
  const expiresAt = new Date(sentAt);
  expiresAt.setDate(expiresAt.getDate() + 30);

  // 5. Save token στη DB (ακυρώνει παλιό αν υπάρχει)
  const { error: updateError } = await supabase
    .from('members')
    .update({
      email_verification_token: token,
      email_verification_sent_at: sentAt.toISOString(),
      email_verification_expires_at: expiresAt.toISOString(),
    })
    .eq('id', memberId);

  if (updateError) {
    return NextResponse.json(
      { error: 'Σφάλμα αποθήκευσης token: ' + updateError.message },
      { status: 500 }
    );
  }

  // 6. Build verification URL
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const verificationUrl = `${baseUrl}/me/${token}`;

  // 7. Render + send email
  const { subject, html, text } = renderMemberVerificationEmail({
    clubName: club.name,
    clubLogoUrl: settings?.logo_url ?? null,
    primaryColor: settings?.primary_color ?? '#800000',
    memberFirstName: member.first_name,
    verificationUrl,
  });

  const { error: sendError } = await getResend().emails.send({
    from: getFromEmail(),
    to: member.email,
    subject,
    html,
    text,
  });

  if (sendError) {
    return NextResponse.json(
      { error: 'Σφάλμα αποστολής email: ' + sendError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    sent_at: sentAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    member_email: member.email,
  });
}
