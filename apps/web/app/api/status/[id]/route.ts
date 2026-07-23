import { NextResponse } from 'next/server';
import { toErrorResponse } from '@premeet/worker';
import { getServerRepo } from '@/lib/repo';
import { getViewerIdentity } from '@/lib/request';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 進捗取得（docs/04）。MVP では生成はインラインで完結するため、
// クライアントは主に結果表示に使う。パラメータはスラッグで受ける。
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    // 非公開レポートは所有者本人だけが状態取得できる（スラッグ総当たり対策）
    const viewer = await getViewerIdentity();
    const report = await getServerRepo().getReportBySlug(id, viewer);
    if (!report) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: '見つかりません' } },
        { status: 404 },
      );
    }
    return NextResponse.json({ status: report.status, report });
  } catch (err) {
    return NextResponse.json(toErrorResponse(err), { status: 500 });
  }
}
