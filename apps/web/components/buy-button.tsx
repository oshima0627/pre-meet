'use client';

import { useState } from 'react';

// クレジット購入ボタン。/api/checkout で Stripe セッションを作り遷移する。
// highlight=true（おすすめプラン）はグラデの主ボタン、それ以外は控えめな枠線ボタンにして
// 視線をおすすめプランに誘導する。
export function BuyButton({
  pack,
  label,
  highlight = false,
}: {
  pack: string;
  label: string;
  highlight?: boolean;
}) {
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

  const base = highlight
    ? 'btn-primary w-full'
    : 'w-full inline-flex items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50/60 px-4 py-2.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-60';

  return (
    <div>
      <button onClick={buy} disabled={loading} className={base}>
        {loading ? '処理中…' : `${label}を購入`}
      </button>
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
    </div>
  );
}
