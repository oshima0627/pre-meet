'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// URLか企業名かを簡易判定（http始まり or ドットを含む → URL）
function guessType(v: string): 'url' | 'name' {
  const s = v.trim();
  if (/^https?:\/\//i.test(s)) return 'url';
  if (/\.[a-z]{2,}/i.test(s) && !/\s/.test(s)) return 'url';
  return 'name';
}

export function ResearchForm() {
  const [input, setInput] = useState('');
  const [tier, setTier] = useState<'free' | 'paid'>('free');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/research', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input, inputType: guessType(input), tier }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? '生成に失敗しました');
        return;
      }
      router.push(`/r/${json.slug}`);
    } catch {
      setError('通信に失敗しました。しばらくして再度お試しください。');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="https://example.co.jp または 企業名"
        className="w-full rounded-lg border border-slate-300 px-4 py-3 text-base shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        disabled={loading}
      />
      <div className="flex items-center gap-4 text-sm">
        <label className="flex items-center gap-1">
          <input
            type="radio"
            checked={tier === 'free'}
            onChange={() => setTier('free')}
          />
          無料（事実の要約まで）
        </label>
        <label className="flex items-center gap-1">
          <input
            type="radio"
            checked={tier === 'paid'}
            onChange={() => setTier('paid')}
          />
          完全版（仮説・切り口・質問・反論）
        </label>
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
      >
        {loading ? '生成中…（最大90秒）' : 'リサーチシートを作成'}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <p className="text-xs text-slate-500">
        公開情報のみを収集します。生成結果はAIによる推測を含み、正確性を保証しません。
      </p>
    </form>
  );
}
