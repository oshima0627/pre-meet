import { PACKS, type PackId } from '@/lib/stripe';
import { BuyButton } from '@/components/buy-button';

export const dynamic = 'force-dynamic';

// 表示順とおすすめ（スタンダードを中央で強調＝選ばれやすくする）。
const ORDER: PackId[] = ['starter', 'standard', 'pro'];
const RECOMMENDED: PackId = 'standard';

// 全プラン共通の価値（各カードに小さく載せて安心材料にする）。
const PERKS = ['全機能を利用可能', '有効期限は6ヶ月', '生成失敗時は自動返還'];

export default function Pricing() {
  return (
    <main>
      <section className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">料金</h1>
        <p className="mx-auto mt-3 max-w-xl text-slate-600">
          サブスクではなく
          <span className="font-semibold text-slate-800">クレジット買い切り</span>。 1レポート =
          1クレジット。有効期限は購入日から6ヶ月です。
        </p>
      </section>

      <div className="grid items-start gap-5 sm:grid-cols-3">
        {ORDER.map((id) => {
          const p = PACKS[id];
          const recommended = id === RECOMMENDED;
          const perCredit = Math.round(p.amountJpy / p.credits);
          return (
            <div
              key={id}
              className={
                recommended
                  ? 'relative flex flex-col rounded-2xl bg-white p-6 shadow-lift ring-2 ring-indigo-500 sm:-mt-2 sm:mb-2'
                  : 'card relative flex flex-col p-6'
              }
            >
              {recommended && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 px-3 py-1 text-xs font-semibold text-white shadow-sm">
                  いちばん人気
                </span>
              )}

              <h2 className="font-semibold text-slate-900">{p.label}</h2>

              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-bold tracking-tight text-slate-900">
                  {p.amountJpy.toLocaleString()}
                </span>
                <span className="text-sm text-slate-500">円</span>
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="text-sm text-slate-600">{p.credits}クレジット</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                  1回あたり約{perCredit}円
                </span>
              </div>

              <ul className="mt-4 space-y-2 text-sm text-slate-600">
                {PERKS.map((perk) => (
                  <li key={perk} className="flex items-center gap-2">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4 shrink-0 text-indigo-500"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    {perk}
                  </li>
                ))}
              </ul>

              <div className="mt-6">
                <BuyButton pack={id} label={p.label} highlight={recommended} />
              </div>
            </div>
          );
        })}
      </div>

      <p className="mx-auto mt-8 max-w-2xl text-center text-xs leading-relaxed text-slate-500">
        購入前にご確認ください：クレジットの有効期限は6ヶ月です。生成に失敗した場合はクレジットを自動で返還します。
        詳細は
        <a href="/tokushoho" className="text-slate-600 underline">
          特定商取引法に基づく表記
        </a>
        をご覧ください。
      </p>
    </main>
  );
}
