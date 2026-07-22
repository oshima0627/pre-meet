import { NextResponse } from 'next/server';
import { toErrorResponse } from '@premeet/worker';
import { getServerRepo } from '@/lib/repo';

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
    const report = await getServerRepo().getReportBySlug(id);
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
