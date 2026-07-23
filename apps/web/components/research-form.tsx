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
  // 自社情報（任意）。完全版(paid)の切り口・質問・反論を、依頼主の商材に合わせて
  // 最適化するための文脈。無料版は Stage2 を実行しないため送らない。
  const [ownService, setOwnService] = useState('');
  const [ownTarget, setOwnTarget] = useState('');
  const [ownCompany, setOwnCompany] = useState('');
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
        body: JSON.stringify({
          input,
          inputType: guessType(input),
          tier,
          // 完全版のときだけ自社文脈を送る（無料版では使われず、キャッシュも外れるため）。
          ownContext:
            tier === 'paid' && ownService.trim()
              ? {
                  companyName: ownCompany.trim(),
                  serviceSummary: ownService.trim(),
                  targetCustomer: ownTarget.trim(),
                }
              : null,
        }),
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

  // プラン選択カード（選択中はブランドのリングで強調）。
  const tierCardCls = (selected: boolean) =>
    `flex-1 cursor-pointer rounded-xl border p-3 text-sm transition ${
      selected
        ? 'border-indigo-500 bg-indigo-50/60 ring-2 ring-indigo-500/20'
        : 'border-slate-200 bg-white hover:border-slate-300'
    } ${loading ? 'pointer-events-none opacity-60' : ''}`;

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="relative">
        {/* 入力欄の先頭にリンクアイコンを添えて用途を一目で伝える */}
        <svg
          viewBox="0 0 24 24"
          className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="https://example.co.jp または 企業名"
          className="field pl-11"
          disabled={loading}
        />
      </div>

      {/* スマホでは縦積み（横並びだと長いラベルが窮屈に折り返すため） */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className={tierCardCls(tier === 'free')}>
          <span className="flex items-center gap-2">
            <input
              type="radio"
              className="accent-indigo-600"
              checked={tier === 'free'}
              onChange={() => setTier('free')}
              disabled={loading}
            />
            <span className="font-semibold text-slate-900">無料</span>
          </span>
          <span className="mt-1 block pl-6 text-xs text-slate-500">
            事実の要約まで
          </span>
        </label>
        <label className={tierCardCls(tier === 'paid')}>
          <span className="flex items-center gap-2">
            <input
              type="radio"
              className="accent-indigo-600"
              checked={tier === 'paid'}
              onChange={() => setTier('paid')}
              disabled={loading}
            />
            <span className="font-semibold text-slate-900">完全版</span>
            <span className="rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              1クレジット
            </span>
          </span>
          <span className="mt-1 block pl-6 text-xs text-slate-500">
            仮説・切り口・質問・反論
          </span>
        </label>
      </div>

      {/* 自社情報（任意）。完全版のときだけ表示・送信し、切り口を商材に最適化する。 */}
      {tier === 'paid' && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <p className="text-sm font-semibold text-slate-800">
            自社情報 <span className="font-normal text-slate-400">（任意）</span>
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
            入力すると、完全版の切り口・ヒアリング質問・想定反論をあなたの商材に合わせて最適化します。
          </p>
          <div className="mt-3 space-y-2">
            <textarea
              value={ownService}
              onChange={(e) => setOwnService(e.target.value)}
              placeholder="自社サービスの概要（何を・誰に提供しているか）"
              rows={2}
              className="field resize-none py-2.5 text-sm"
              disabled={loading}
            />
            <input
              type="text"
              value={ownTarget}
              onChange={(e) => setOwnTarget(e.target.value)}
              placeholder="想定顧客（例: 従業員100〜500名の製造業）"
              className="field py-2.5 text-sm"
              disabled={loading}
            />
            <input
              type="text"
              value={ownCompany}
              onChange={(e) => setOwnCompany(e.target.value)}
              placeholder="自社名（任意）"
              className="field py-2.5 text-sm"
              disabled={loading}
            />
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="btn-primary w-full py-3 text-base"
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
