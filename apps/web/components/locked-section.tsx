// 有料セクションのぼかし表示（docs/04）。
// 完全に隠さず「何が得られるか」を見せることで課金理由を明確にする。
export function LockedSection({ title }: { title: string }) {
  return (
    <section className="card relative overflow-hidden p-5">
      <h2 className="flex items-center gap-2 font-semibold text-slate-900">
        <span className="h-4 w-1 rounded-full bg-gradient-to-b from-indigo-500 to-violet-500" />
        {title}
      </h2>
      <div className="pointer-events-none mt-3 select-none space-y-2 blur-sm">
        <div className="h-4 w-3/4 rounded bg-slate-200" />
        <div className="h-4 w-full rounded bg-slate-200" />
        <div className="h-4 w-2/3 rounded bg-slate-200" />
      </div>
      {/* ぼかしの上に、うっすらグラデを重ねてから解錠CTAを中央に置く */}
      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-white via-white/70 to-white/30">
        <a href="/pricing" className="btn-primary shadow-lift">
          <span aria-hidden>🔓</span>
          クレジットで完全版をアンロック
        </a>
      </div>
    </section>
  );
}
