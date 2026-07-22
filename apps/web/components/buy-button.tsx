'use client';

import { useState } from 'react';

// クレジット購入ボタン。/api/checkout で Stripe セッションを作り遷移する。
export function BuyButton({ pack, label }: { pack: string; label: string }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function buy() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pack }),
      });
      const json = await res.json();
      if (res.status === 401) {
        setErr('購入にはログインが必要です。');
        return;
      }
      if (!res.ok || !json.url) {
        setErr(json?.error?.message ?? '購入手続きに失敗しました');
        return;
      }
      window.location.href = json.url;
    } catch {
      setErr('通信に失敗しました。');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={buy}
        disabled={loading}
        className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {loading ? '処理中…' : `${label}を購入`}
      </button>
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </div>
  );
}
