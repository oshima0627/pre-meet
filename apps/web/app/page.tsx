import { ResearchForm } from '@/components/research-form';

export default function Home() {
  return (
    <main>
      <section className="mb-8">
        <h1 className="text-2xl font-bold leading-snug sm:text-3xl">
          会社URLを入れるだけで、
          <br className="hidden sm:block" />
          商談前リサーチが1枚になる。
        </h1>
        <p className="mt-3 text-slate-600">
          想定課題・刺さる切り口・ヒアリング質問・想定反論まで。BtoB営業の下調べを自動化します。
        </p>
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <ResearchForm />
      </section>

      <section className="mt-10 grid gap-4 sm:grid-cols-3">
        {[
          ['入力はURL1本', '自分でリサーチして貼り付ける作業が不要です。'],
          ['求人からの逆算', '募集職種から「社内で何が不足しているか」を推定します。'],
          ['固定フォーマット', '毎回ブレない出力構造。チームで共有できます。'],
        ].map(([t, d]) => (
          <div key={t} className="rounded-xl border bg-white p-4">
            <h3 className="font-semibold">{t}</h3>
            <p className="mt-1 text-sm text-slate-600">{d}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
