'use client';

import { useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase-browser';

export default function Login() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function magicLink(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const { error } = await getSupabaseBrowser().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    if (error) setErr(error.message);
    else setSent(true);
  }

  async function google() {
    await getSupabaseBrowser().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
  }

  return (
    <main className="mx-auto max-w-sm">
      <h1 className="text-xl font-bold">ログイン</h1>
      <p className="mt-2 text-sm text-slate-600">
        無料で作った結果の保存、クレジット購入にはログインが必要です。
      </p>

      {sent ? (
        <p className="mt-6 rounded-lg bg-green-50 p-4 text-sm text-green-800">
          ログイン用のリンクをメールで送りました。メールをご確認ください。
        </p>
      ) : (
        <>
          <button
            onClick={google}
            className="mt-6 w-full rounded-lg border bg-white px-4 py-2 text-sm font-semibold shadow-sm hover:bg-slate-50"
          >
            Google でログイン
          </button>
          <form onSubmit={magicLink} className="mt-4 space-y-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              メールでログインリンクを受け取る
            </button>
          </form>
          {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
        </>
      )}
    </main>
  );
}
