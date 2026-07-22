import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// クレジット残高（docs/04）。RLS（security_invoker ビュー）で自分の残高のみ見える。
export async function GET() {
  try {
    const supabase = await getSupabaseServer();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      return NextResponse.json({ balance: 0 });
    }
    const { data } = await supabase
      .from('credit_balances')
      .select('balance')
      .maybeSingle();
    return NextResponse.json({ balance: data?.balance ?? 0 });
  } catch {
    return NextResponse.json({ balance: 0 });
  }
}
