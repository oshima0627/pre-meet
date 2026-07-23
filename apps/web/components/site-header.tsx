import { getSupabaseServer } from '@/lib/supabase-server';
import { BrandMark } from './brand-mark';
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
    <nav className="flex h-16 items-center justify-between">
      <a href="/" className="group flex items-center gap-2">
        <BrandMark className="h-8 w-8 shrink-0 drop-shadow-sm transition group-hover:scale-105" />
        <span className="text-lg font-bold tracking-tight text-slate-900">
          Pre<span className="text-gradient">Meet</span>
        </span>
      </a>

      {/* スマホは項目が多いと溢れるため、文字・余白を詰める（sm以上で通常サイズ） */}
      <div className="flex items-center gap-1 text-xs text-slate-600 sm:gap-3 sm:text-sm">
        <a
          href="/reports"
          className="rounded-lg px-2 py-1.5 font-medium transition hover:bg-slate-100 hover:text-slate-900"
        >
          リサーチ一覧
        </a>
        <a
          href="/pricing"
          className="rounded-lg px-2 py-1.5 font-medium transition hover:bg-slate-100 hover:text-slate-900"
        >
          料金
        </a>
        {state.loggedIn ? (
          <>
            {/* 残高はクリックで購入導線（料金ページ）へ。無人運用でも導線を切らさない。
                スマホでは「🪙3」まで詰め、sm以上で「クレジット」表記を出す */}
            <a
              href="/pricing"
              title="保有クレジット（クリックで追加購入）"
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-gradient-to-r from-indigo-50 to-violet-50 px-2.5 py-1 font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-100 transition hover:from-indigo-100 hover:to-violet-100 sm:px-3"
            >
              <span aria-hidden>🪙</span>
              {state.balance}
              <span className="hidden sm:inline"> クレジット</span>
            </a>
            <LogoutButton />
          </>
        ) : (
          <a
            href="/login"
            className="btn-primary px-3 py-1.5 text-xs sm:px-4 sm:text-sm"
          >
            ログイン
          </a>
        )}
      </div>
    </nav>
  );
}
