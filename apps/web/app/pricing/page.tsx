import { PACKS, type PackId } from '@/lib/stripe';
import { BuyButton } from '@/components/buy-button';

export const dynamic = 'force-dynamic';

export default function Pricing() {
  const order: PackId[] = ['starter', 'standard', 'pro'];
  return (
    <main>
      <h1 className="text-2xl font-bold">料金</h1>
      <p className="mt-2 text-slate-600">
        サブスクではなくクレジット買い切り。1レポート = 1クレジット。有効期限は購入日から6ヶ月です。
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {order.map((id) => {
          const p = PACKS[id];
          return (
            <div key={id} className="flex flex-col rounded-2xl border bg-white p-5">
              <h2 className="font-semibold">{p.label}</h2>
              <p className="mt-1 text-2xl font-bold">
                {p.amountJpy.toLocaleString()}
                <span className="text-sm font-normal text-slate-500">円</span>
              </p>
              <p className="text-sm text-slate-600">
                {p.credits}クレジット（1回あたり約
                {Math.round(p.amountJpy / p.credits)}円）
              </p>
              <div className="mt-4">
                <BuyButton pack={id} label={p.label} />
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-xs text-slate-500">
        購入前にご確認ください：クレジットの有効期限は6ヶ月です。生成に失敗した場合はクレジットを自動で返還します。
        詳細は<a href="/tokushoho" className="underline">特定商取引法に基づく表記</a>をご覧ください。
      </p>
    </main>
  );
}
