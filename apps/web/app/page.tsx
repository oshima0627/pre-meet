import { ResearchForm } from '@/components/research-form';
import { getUserId } from '@/lib/supabase-server';

// 特徴カードのアイコン（インラインSVG。外部依存を増やさない）。
const FEATURES: { title: string; desc: string; icon: React.ReactNode }[] = [
  {
    title: '入力はURL1本',
    desc: '自分でリサーチして貼り付ける作業が不要です。',
    icon: (
      <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    ),
  },
  {
    title: '求人からの逆算',
    desc: '募集職種から「社内で何が不足しているか」を推定します。',
    icon: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </>
    ),
  },
  {
    title: '固定フォーマット',
    desc: '毎回ブレない出力構造。チームで共有できます。',
    icon: (
      <>
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M8 8h8M8 12h8M8 16h5" />
      </>
    ),
  },
];

export default async function Home() {
  // 未ログインは完全版を選べないようにするため、ログイン状態をフォームへ渡す。
  const loggedIn = (await getUserId()) != null;
  return (
    <main>
      <section className="mb-8 text-center sm:mb-10 sm:pt-4">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-100 bg-white/70 px-3 py-1 text-xs font-semibold text-indigo-700 shadow-sm backdrop-blur-sm">
          <span aria-hidden>⚡</span>
          BtoB営業の下調べを、URL1本で
        </span>
        <h1 className="mt-5 text-3xl font-bold leading-[1.15] tracking-tight sm:text-[2.75rem]">
          会社URLを入れるだけで、
          <br className="hidden sm:block" />
          <span className="text-gradient">商談前リサーチが1枚</span>になる。
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-slate-600">
          想定課題・刺さる切り口・ヒアリング質問・想定反論まで。
          <br className="hidden sm:block" />
          BtoB営業の下調べを自動化します。
        </p>
      </section>

      <section className="card p-5 shadow-lift sm:p-6">
        <ResearchForm loggedIn={loggedIn} />
      </section>

      <section className="mt-12 grid gap-4 sm:grid-cols-3">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="card p-5 transition-all hover:-translate-y-0.5 hover:shadow-lift"
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-50 to-violet-50 text-indigo-600 ring-1 ring-inset ring-indigo-100">
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                {f.icon}
              </svg>
            </span>
            <h3 className="mt-3 font-semibold text-slate-900">{f.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              {f.desc}
            </p>
          </div>
        ))}
      </section>
    </main>
  );
}
