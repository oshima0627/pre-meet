import { cookies } from 'next/headers';
import { getServerRepo } from '@/lib/repo';
import { getUserId } from '@/lib/supabase-server';
import type { ReportStatus, Tier } from '@premeet/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 日付を「YYYY/MM/DD HH:mm」で表示（UTC保存 → 日本時間で見せる）
function formatDate(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  }).format(d);
}

function StatusBadge({ status }: { status: ReportStatus }) {
  if (status === 'done') return null; // 正常は装飾を足さない（一覧を静かに保つ）
  const map: Record<string, { label: string; cls: string }> = {
    failed: { label: '生成失敗', cls: 'bg-red-50 text-red-600' },
    queued: { label: '生成中', cls: 'bg-amber-50 text-amber-700' },
    collecting: { label: '生成中', cls: 'bg-amber-50 text-amber-700' },
    generating: { label: '生成中', cls: 'bg-amber-50 text-amber-700' },
  };
  const s = map[status];
  if (!s) return null;
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}

function TierBadge({ tier }: { tier: Tier }) {
  return tier === 'paid' ? (
    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
      完全版
    </span>
  ) : (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
      無料
    </span>
  );
}

export default async function ReportsPage() {
  // ログインは user_id、未ログインは匿名Cookieで自分の履歴を絞る
  const userId = await getUserId();
  const store = await cookies();
  const anonId = store.get('pm_anon')?.value ?? null;

  const reports = await getServerRepo().listReports({ userId, anonId, limit: 50 });

  return (
    <main>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">リサーチ一覧</h1>
          <p className="mt-1 text-sm text-slate-600">
            これまでに作成したリサーチシートを見返せます。
          </p>
        </div>
        <a
          href="/"
          className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
        >
          新規作成
        </a>
      </div>

      {reports.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-white p-10 text-center">
          <p className="text-sm text-slate-500">
            まだリサーチがありません。
          </p>
          <a
            href="/"
            className="mt-3 inline-block text-sm font-medium text-indigo-600 hover:underline"
          >
            最初のリサーチを作成する →
          </a>
          {!userId && (
            <p className="mt-4 text-xs text-slate-400">
              ※ ログインすると、端末をまたいで履歴を残せます。
            </p>
          )}
        </div>
      ) : (
        <ul className="divide-y rounded-2xl border bg-white">
          {reports.map((r) => {
            const title = r.companyName || r.companyDomain || '（会社名不明）';
            const clickable = r.status === 'done';
            const body = (
              <div className="flex items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold text-slate-900">
                      {title}
                    </span>
                    <TierBadge tier={r.tier} />
                    <StatusBadge status={r.status} />
                  </div>
                  {r.companyDomain && (
                    <p className="mt-0.5 truncate text-xs text-slate-400">
                      {r.companyDomain}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <time className="text-xs text-slate-400">
                    {formatDate(r.createdAt)}
                  </time>
                  {clickable && <span className="text-slate-300">›</span>}
                </div>
              </div>
            );
            return (
              <li key={r.slug}>
                {clickable ? (
                  <a href={`/r/${r.slug}`} className="block hover:bg-slate-50">
                    {body}
                  </a>
                ) : (
                  <div className="opacity-70">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
