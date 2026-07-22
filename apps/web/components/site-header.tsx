import { getSupabaseServer } from '@/lib/supabase-server';
import { LogoutButton } from './logout-button';

// ヘッダーのログイン状態を取得する。未ログイン・失敗時は「ログイン」導線を出す。
async function getHeaderState(): Promise<
  { loggedIn: false } | { loggedIn: true; balance: number }
> {
  try {
    const supabase = await getSupabaseServer();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return { loggedIn: false };
    // 残高は security_invoker ビュー経由（自分の分のみRLSで見える。docs/04）
    const { data } = await supabase
      .from('credit_balances')
      .select('balance')
      .maybeSingle();
    return { loggedIn: true, balance: data?.balance ?? 0 };
  } catch {
    return { loggedIn: false };
  }
}

export async function SiteHeader() {
  const state = await getHeaderState();

  return (
    <header className="mb-8 flex items-center justify-between">
      <a href="/" className="text-lg font-bold tracking-tight">
        Pre<span className="text-indigo-600">Meet</span>
      </a>
      <nav className="flex items-center gap-4 text-sm text-slate-600">
        <a href="/pricing" className="hover:text-slate-900">
          料金
        </a>
        {state.loggedIn ? (
          <>
            {/* 残高はクリックで購入導線（料金ページ）へ。無人運用でも導線を切らさない */}
            <a
              href="/pricing"
              title="保有クレジット（クリックで追加購入）"
              className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-100 hover:bg-indigo-100"
            >
              <span aria-hidden>🪙</span>
              {state.balance} クレジット
            </a>
            <LogoutButton />
          </>
        ) : (
          <a href="/login" className="hover:text-slate-900">
            ログイン
          </a>
        )}
      </nav>
    </header>
  );
}
