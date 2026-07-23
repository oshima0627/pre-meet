import { NextResponse } from 'next/server';
import {
  handleResearchRequest,
  loadConfig,
  toErrorResponse,
  AppError,
  type HandleResearchInput,
} from '@premeet/worker';
import { getServerRepo } from '@/lib/repo';
import { getKv } from '@/lib/kv';
import { getRateLimitKv } from '@/lib/cf';
import {
  getIpHash,
  getOrCreateAnonId,
  setAnonCookie,
  todayUtc,
} from '@/lib/request';
import { getUserId } from '@/lib/supabase-server';
import type { OwnContext } from '@premeet/shared';

// 生成は最大90秒（docs/01）。Node ランタイムで動かす（CF Pages では edge 化が必要）。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Body {
  input?: string;
  inputType?: 'url' | 'name';
  tier?: 'free' | 'paid';
  // 自社文脈（用途・自社サービス等）。型は shared を単一の情報源とする（CLAUDE.md）。
  ownContext?: OwnContext | null;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    if (!body.input || typeof body.input !== 'string') {
      throw new AppError('INVALID_INPUT', 'input が必要です');
    }

    const [userId, ipHash, anon] = await Promise.all([
      getUserId(),
      getIpHash(),
      getOrCreateAnonId(),
    ]);

    const input: HandleResearchInput = {
      input: body.input,
      inputType: body.inputType === 'name' ? 'name' : 'url',
      tier: body.tier === 'paid' ? 'paid' : 'free',
      ownContext: body.ownContext ?? null,
      userId,
      anonId: anon.anonId,
      ipHash,
      date: todayUtc(),
    };

    const config = loadConfig();
    const repo = getServerRepo();
    // 本番は Cloudflare KV（共有）、ローカルはメモリにフォールバック
    const kv = getKv(await getRateLimitKv());
    const result = await handleResearchRequest({ repo, kv, config }, input);

    // KPI 計測（失敗しても本流を止めない。docs/03 events）
    void repo
      .logEvent({
        name: 'submit_url',
        anonId: anon.anonId,
        userId,
        props: { tier: input.tier, cached: result.cached },
      })
      .catch(() => {});

    const res = NextResponse.json({
      reportId: result.reportId,
      slug: result.slug,
      status: result.status,
      cached: result.cached,
      report: result.report,
    });
    // 匿名IDを発行した場合は Cookie を保存（次回以降のレート制限・履歴紐付け）
    if (anon.isNew) {
      const c = setAnonCookie(anon.anonId);
      res.cookies.set(c.name, c.value, c.options);
    }
    return res;
  } catch (err) {
    const status = err instanceof AppError ? err.http : 500;
    // 想定外エラー（UNKNOWN）は原因が握りつぶされるため、本番ログに実体を残す。
    // AppError は想定内なので出さない（ログ汚染を避ける）。
    // 想定外エラーは運用ログに実体を残す（ユーザーには定型文言のみ返す）。
    if (!(err instanceof AppError)) {
      console.error('[api/research] 想定外エラー:', err);
    }
    return NextResponse.json(toErrorResponse(err), { status });
  }
}
