// 有料セクションのぼかし表示（docs/04）。
// 完全に隠さず「何が得られるか」を見せることで課金理由を明確にする。
export function LockedSection({ title }: { title: string }) {
  return (
    <section className="relative overflow-hidden rounded-xl border bg-white p-4">
      <h2 className="font-semibold text-slate-800">{title}</h2>
      <div className="pointer-events-none mt-2 select-none space-y-2 blur-sm">
        <div className="h-4 w-3/4 rounded bg-slate-200" />
        <div className="h-4 w-full rounded bg-slate-200" />
        <div className="h-4 w-2/3 rounded bg-slate-200" />
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-white/40">
        <a
          href="/pricing"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700"
        >
          クレジットで完全版をアンロック
        </a>
      </div>
    </section>
  );
}
