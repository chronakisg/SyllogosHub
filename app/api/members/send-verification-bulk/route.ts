import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { resend, FROM_EMAIL } from '@/lib/email/resend';
import { renderMemberVerificationEmail } from '@/lib/email/templates/memberVerification';
import { randomUUID } from 'crypto';

type BulkResult = {
  total_candidates: number;
  sent: number;
  skipped: number;
  errors: Array<{ member_id: string; reason: string }>;
};

export async function POST(request: Request) {
  const supabase = await getServerClient();

  // 1. Auth check
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Parse body (dry_run optional)
  let dryRun = false;
  try {
    const body = await request.json();
    dryRun = body?.dry_run === true;
  } catch {
    // No body → default dry_run=false
  }

  // 3. Get current user's club_id (email-based lookup, matches useCurrentClub pattern)
  const userEmail = user.email;
  if (!userEmail) {
    return NextResponse.json(
      { error: 'No email on auth user' },
      { status: 400 }
    );
  }

  const { data: currentMember } = await supabase
    .from('members')
    .select('club_id')
    .ilike('email', userEmail)
    .maybeSingle();

  const userClubId = currentMember?.club_id;
  if (!userClubId) {
    return NextResponse.json(
      { error: 'Δεν βρέθηκε σύλλογος για τον τρέχοντα χρήστη' },
      { status: 400 }
    );
  }

  // 4. Fetch all members με email + !email_verified σε αυτόν τον σύλλογο
  const { data: candidates, error: candidatesError } = await supabase
    .from('members')
    .select('id, first_name, email')
    .eq('club_id', userClubId)
    .eq('email_verified', false)
    .not('email', 'is', null);

  if (candidatesError || !candidates) {
    return NextResponse.json(
      { error: 'Σφάλμα ανάκτησης μελών: ' + (candidatesError?.message ?? 'unknown') },
      { status: 500 }
    );
  }

  const result: BulkResult = {
    total_candidates: candidates.length,
    sent: 0,
    skipped: 0,
    errors: [],
  };

  // 5. Dry run → return count χωρίς send
  if (dryRun) {
    return NextResponse.json(result);
  }

  // 6. Fetch club + settings μία φορά
  const [clubResult, settingsResult] = await Promise.all([
    supabase.from('clubs').select('id, name').eq('id', userClubId).single(),
    supabase
      .from('club_settings')
      .select('logo_url, primary_color')
      .eq('club_id', userClubId)
      .maybeSingle(),
  ]);

  if (clubResult.error || !clubResult.data) {
    return NextResponse.json({ error: 'Club not found' }, { status: 404 });
  }

  const club = clubResult.data;
  const settings = settingsResult.data;

  // 7. Loop με sequential send (rate-limit safe)
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  for (const candidate of candidates) {
    if (!candidate.email) {
      result.skipped++;
      continue;
    }

    try {
      const token = randomUUID();
      const sentAt = new Date();
      const expiresAt = new Date(sentAt);
      expiresAt.setDate(expiresAt.getDate() + 30);

      // Save token
      const { error: updateError } = await supabase
        .from('members')
        .update({
          email_verification_token: token,
          email_verification_sent_at: sentAt.toISOString(),
          email_verification_expires_at: expiresAt.toISOString(),
        })
        .eq('id', candidate.id);

      if (updateError) {
        result.errors.push({
          member_id: candidate.id,
          reason: 'DB update failed: ' + updateError.message,
        });
        continue;
      }

      // Send email
      const verificationUrl = `${baseUrl}/me/${token}`;
      const { subject, html, text } = renderMemberVerificationEmail({
        clubName: club.name,
        clubLogoUrl: settings?.logo_url ?? null,
        primaryColor: settings?.primary_color ?? '#800000',
        memberFirstName: candidate.first_name,
        verificationUrl,
      });

      const { error: sendError } = await resend.emails.send({
        from: FROM_EMAIL,
        to: candidate.email,
        subject,
        html,
        text,
      });

      if (sendError) {
        result.errors.push({
          member_id: candidate.id,
          reason: 'Email send failed: ' + sendError.message,
        });
        continue;
      }

      result.sent++;
    } catch (err) {
      result.errors.push({
        member_id: candidate.id,
        reason: 'Unexpected error: ' + (err instanceof Error ? err.message : 'unknown'),
      });
    }
  }

  return NextResponse.json(result);
}
