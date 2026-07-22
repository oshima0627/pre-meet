import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSupabaseServer } from '@/lib/supabase-server';
import { getServerRepo } from '@/lib/repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// OAuth / マジックリンクのコールバック。セッション確立後、匿名で作った結果を
// ログインユーザーへマージする（「無料で作った結果を残したいからログイン」導線。docs/03）。
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/';

  if (code) {
    const supabase = await getSupabaseServer();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      try {
        const store = await cookies();
        const anonId = store.get('pm_anon')?.value;
        if (anonId) await getServerRepo().mergeAnonToUser(anonId, data.user.id);
      } catch {
        // マージ失敗はログインを妨げない
      }
    }
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
