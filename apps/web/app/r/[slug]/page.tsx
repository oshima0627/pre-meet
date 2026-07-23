import { notFound } from 'next/navigation';
import { getServerRepo } from '@/lib/repo';
import { getViewerIdentity } from '@/lib/request';
import { ReportView } from '@/components/report-view';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 結果ページ（docs/04）。共有可・OGP対応の対象だが、デフォルトは非公開（docs/06,07）。
export default async function ReportPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // 公開レポート or 所有者本人にのみ表示する（非公開の他人レポートは 404 扱い）
  const viewer = await getViewerIdentity();
  const report = await getServerRepo().getReportBySlug(slug, viewer);
  if (!report) notFound();

  if (report.status === 'failed') {
    return (
      <main>
        <h1 className="text-xl font-bold">生成できませんでした</h1>
        <p className="mt-2 text-sm text-slate-600">
          {report.errorCode === 'THIN_CONTENT'
            ? '公開情報が少なく、十分なリサーチができませんでした。'
            : '取得または生成に失敗しました。'}
          {report.tier === 'paid' && ' クレジットは返還されています。'}
        </p>
        <a href="/" className="mt-4 inline-block text-sm text-indigo-600 hover:underline">
          ← 別の会社で試す
        </a>
      </main>
    );
  }

  return (
    <main>
      <div className="mb-4">
        <h1 className="text-xl font-bold">
          {report.company.name ?? report.company.domain}
        </h1>
        <p className="text-sm text-slate-500">{report.company.domain}</p>
      </div>
      <ReportView report={report} />
      <a href="/" className="mt-6 inline-block text-sm text-indigo-600 hover:underline">
        ← 別の会社で試す
      </a>
    </main>
  );
}
