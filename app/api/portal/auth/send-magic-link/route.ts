import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getResend, getFromEmail } from '@/lib/email/resend';
import { renderMemberMagicLinkEmail } from '@/lib/email/templates/memberMagicLink';
import type { Database } from '@/lib/supabase/types';

type RequestBody = { email?: string };

export async function POST(request: Request) {
  // 1. Parse body
  let email: string;
  try {
    const body = (await request.json()) as RequestBody;
    if (!body.email || typeof body.email !== 'string') {
      return NextResponse.json(
        { error: 'Email απαιτείται' },
        { status: 400 }
      );
    }
    email = body.email.trim().toLowerCase();
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    );
  }

  // 2. Service client για member lookup (bypass RLS)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('Missing Supabase env vars');
    return NextResponse.json(
      { error: 'Server misconfiguration' },
      { status: 500 }
    );
  }
  const admin = createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 3. Find member by email
  const { data: member, error: memberError } = await admin
    .from('members')
    .select('id, first_name, last_name, email, club_id')
    .eq('email', email)
    .maybeSingle();

  if (memberError || !member) {
    return NextResponse.json(
      {
        error:
          'Δεν είστε μέλος του συλλόγου. Επικοινωνήστε με τη γραμματεία.',
      },
      { status: 404 }
    );
  }

  if (!member.club_id) {
    return NextResponse.json(
      { error: 'Το μέλος δεν είναι συνδεδεμένο με σύλλογο' },
      { status: 500 }
    );
  }

  // 4. Load club branding
  const clubId = member.club_id;
  const { data: club } = await admin
    .from('clubs')
    .select('id, name')
    .eq('id', clubId)
    .maybeSingle();

  const { data: settings } = await admin
    .from('club_settings')
    .select('logo_url, primary_color')
    .eq('club_id', clubId)
    .maybeSingle();

  const clubName = club?.name ?? 'Σύλλογος';
  const logoUrl = settings?.logo_url ?? null;
  const primaryColor = settings?.primary_color ?? '#800000';

  // 5. Generate magic link via Supabase Admin API
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  if (!appUrl) {
    return NextResponse.json(
      { error: 'NEXT_PUBLIC_APP_URL not configured' },
      { status: 500 }
    );
  }

  const { data: linkData, error: linkError } =
    await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: {
        redirectTo: `${appUrl}/portal/auth-callback`,
      },
    });

  if (linkError || !linkData?.properties?.action_link) {
    console.error('generateLink failed:', linkError);
    return NextResponse.json(
      { error: 'Σφάλμα δημιουργίας συνδέσμου' },
      { status: 500 }
    );
  }

  // Build custom callback URL με hashed_token (PKCE-incompatible
  // with admin-generated links, οπότε χρησιμοποιούμε verifyOtp
  // server-side στο auth-callback)
  const magicLinkUrl = `${appUrl}/portal/auth-callback?token_hash=${encodeURIComponent(linkData.properties.hashed_token)}&type=magiclink`;

  // 6. Send branded email via Resend
  const memberName = `${member.first_name} ${member.last_name}`.trim();
  const { subject, html, text } = renderMemberMagicLinkEmail({
    memberName,
    magicLinkUrl,
    clubName,
    logoUrl,
    primaryColor,
  });

  const { error: sendError } = await getResend().emails.send({
    from: getFromEmail(),
    to: email,
    subject,
    html,
    text,
  });

  if (sendError) {
    console.error('Resend send failed:', sendError);
    return NextResponse.json(
      { error: 'Σφάλμα αποστολής email' },
      { status: 500 }
    );
  }

  // 7. Success
  return NextResponse.json({ success: true });
}
