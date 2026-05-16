import { NextResponse } from 'next/server';
import { getCurrentMember } from '@/lib/auth/portalAuth';
import { getServerClient } from '@/lib/supabase/server';

export async function POST() {
  const member = await getCurrentMember();
  if (!member) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await getServerClient();
  const now = new Date().toISOString();

  const { error } = await supabase
    .from('members')
    .update({ last_announcement_check_at: now })
    .eq('id', member.id);

  if (error) {
    console.error('mark-read update failed:', error);
    return NextResponse.json(
      { error: 'Δεν ήταν δυνατή η σήμανση ως αναγνωσμένα' },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, marked_at: now });
}
