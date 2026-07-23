'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabase-browser';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // 二重送信・多重OAuth遷移を防ぐためのローディング状態
  const [loading, setLoading] = useState<null | 'email' | 'google'>(null);
  // ログイン状態を確認するまでフォームを出さない（ログイン済みならトップへ）
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    getSupabaseBrowser()
      .auth.getUser()
      .then(({ data }) => {
        // 既にログイン済みならログイン画面を見せずトップへ戻す
        if (data.user) router.replace('/');
        else setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [router]);

  if (checking) {
    return (
      <main className="flex justify-center py-20">
        <p className="text-sm text-slate-400">読み込み中…</p>
      </main>
    );
  }

  async function magicLink(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading('email');
    const { error } = await getSupabaseBrowser().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    if (error) setErr(error.message);
    else setSent(true);
    setLoading(null);
  }

  async function google() {
    setErr(null);
    setLoading('google');
    const { error } = await getSupabaseBrowser().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
    // OAuth は成功時に別ドメインへ遷移するため、ここに戻るのはエラー時のみ
    if (error) {
      setErr(error.message);
      setLoading(null);
    }
  }

  return (
    <main className="flex flex-col items-center py-6 sm:py-12">
      <div className="w-full max-w-md">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">ログイン / 新規登録</h1>
          <p className="mt-2 text-sm text-slate-600">
            結果の保存とクレジット購入にはアカウントが必要です。
          </p>
          {/* 初回ボーナスは転換の主要な動機なので目立たせる（docs/03） */}
          <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-100">
            <span aria-hidden>🎁</span>
            初回登録で 3 クレジット無料
          </div>
        </div>

        <div className="card mt-6 p-6 sm:p-8">
          {sent ? (
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <svg
                  className="h-6 w-6 text-green-600"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M22 6l-10 7L2 6" />
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                </svg>
              </div>
              <h2 className="mt-4 font-semibold">メールを確認してください</h2>
              <p className="mt-2 text-sm text-slate-600">
                <span className="font-medium text-slate-900">{email}</span>{' '}
                宛にログイン用のリンクを送りました。
                <br />
                メール内のリンクを開くとログインが完了します。
              </p>
              <button
                onClick={() => {
                  setSent(false);
                  setErr(null);
                }}
                className="mt-6 text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:underline"
              >
                ← 別のメールアドレスを使う
              </button>
              <p className="mt-4 text-xs text-slate-400">
                届かない場合は迷惑メールフォルダもご確認ください。
              </p>
            </div>
          ) : (
            <>
              <button
                onClick={google}
                disabled={loading !== null}
                className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <GoogleIcon />
                {loading === 'google' ? 'Google に接続中…' : 'Google で続ける'}
              </button>

              <div className="my-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-slate-200" />
                <span className="text-xs text-slate-400">または</span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>

              <form onSubmit={magicLink} className="space-y-3">
                <div>
                  <label
                    htmlFor="email"
                    className="mb-1.5 block text-sm font-medium text-slate-700"
                  >
                    メールアドレス
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading !== null}
                  className="btn-primary w-full"
                >
                  {loading === 'email' ? '送信中…' : 'ログインリンクを受け取る'}
                </button>
              </form>

              <p className="mt-4 text-center text-xs text-slate-500">
                パスワードは不要です。メールに届くリンクを開くだけでログインできます。
              </p>

              {err && (
                <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                  {err}
                </p>
              )}
            </>
          )}
        </div>

        <p className="mt-6 text-center text-xs leading-relaxed text-slate-400">
          続行すると
          <a href="/terms" className="text-slate-500 hover:underline">
            利用規約
          </a>
          ・
          <a href="/privacy" className="text-slate-500 hover:underline">
            プライバシーポリシー
          </a>
          に同意したものとみなされます。
        </p>
      </div>
    </main>
  );
}

// Google 公式配色のGマーク（外部依存を増やさないためインラインSVG）
function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}
