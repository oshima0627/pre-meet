'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

// URLか企業名かを簡易判定（http始まり or ドットを含む → URL）
function guessType(v: string): 'url' | 'name' {
  const s = v.trim();
  if (/^https?:\/\//i.test(s)) return 'url';
  if (/\.[a-z]{2,}/i.test(s) && !/\s/.test(s)) return 'url';
  return 'name';
}

// 生成の段階。サーバーのパイプライン（収集→Stage1→Stage2）に対応させた表示。
// 実測の目安秒数で進めるが、レスポンス到着時に「完了」へ飛ばす（嘘をつかない）。
interface Step {
  label: string;
  // この段階に入るおおよその経過秒（あくまで表示上の目安）
  atSec: number;
}
const STEPS_FREE: Step[] = [
  { label: 'サイトを収集しています', atSec: 0 },
  { label: '事実を抽出しています', atSec: 6 },
  { label: '仕上げています', atSec: 14 },
];
const STEPS_PAID: Step[] = [
  { label: 'サイトを収集しています', atSec: 0 },
  { label: '事実を抽出しています', atSec: 6 },
  { label: '仮説・切り口・質問・反論を構築しています', atSec: 16 },
  { label: '仕上げています', atSec: 55 },
];

export function ResearchForm() {
  const [input, setInput] = useState('');
  const [tier, setTier] = useState<'free' | 'paid'>('free');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0); // 経過秒
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const router = useRouter();

  const steps = tier === 'paid' ? STEPS_PAID : STEPS_FREE;
  // 経過秒から現在の段階を決める（最後の段階で頭打ち＝完了前に「完了」と言わない）
  const currentStep = steps.reduce(
    (acc, s, i) => (elapsed >= s.atSec ? i : acc),
    0,
  );

  useEffect(() => {
    // ローディング中だけ経過秒を刻む
    if (loading) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [loading]);

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
      {/* スマホでは縦積み（横並びだと長いラベルが窮屈に折り返すため） */}
      <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:gap-4">
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            checked={tier === 'free'}
            onChange={() => setTier('free')}
            disabled={loading}
          />
          無料（事実の要約まで）
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            checked={tier === 'paid'}
            onChange={() => setTier('paid')}
            disabled={loading}
          />
          完全版（仮説・切り口・質問・反論）
        </label>
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-70"
      >
        {loading ? '生成中…' : 'リサーチシートを作成'}
      </button>

      {/* 生成中の進捗パネル。段階と経過秒を出し「固まって見える」のを防ぐ */}
      {loading && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
          <ul className="space-y-2">
            {steps.map((s, i) => {
              const done = i < currentStep;
              const active = i === currentStep;
              return (
                <li
                  key={s.label}
                  className={`flex items-center gap-2 text-sm ${
                    done
                      ? 'text-slate-400'
                      : active
                        ? 'font-semibold text-indigo-700'
                        : 'text-slate-400'
                  }`}
                >
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center">
                    {done ? (
                      <span className="text-green-600">✓</span>
                    ) : active ? (
                      // くるくる回るスピナー
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo-300 border-t-indigo-600" />
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                    )}
                  </span>
                  {s.label}
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-slate-500">
            経過 {elapsed} 秒
            {tier === 'paid' && '（完全版は最大90秒ほどかかります）'}
          </p>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      <p className="text-xs text-slate-500">
        公開情報のみを収集します。生成結果はAIによる推測を含み、正確性を保証しません。
      </p>
    </form>
  );
}
