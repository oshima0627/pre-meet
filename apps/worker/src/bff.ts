import type { OwnContext, ResearchReport, Tier } from '@premeet/shared';
import type { WorkerConfig } from './lib/env.js';
import { AppError } from './lib/errors.js';
import { normalizeUrl } from './collector/discover.js';
import { resolveNameToUrl } from './pipeline.js';
import { runResearchCached } from './orchestrate.js';
import type { ReportRepo } from './db/repo.js';
import { guardGeneration, type KvStore } from './guard.js';

// 1レポート = 1クレジット（docs/06）
const CREDIT_PER_REPORT = 1;

export interface HandleResearchInput {
  input: string;
  inputType: 'url' | 'name';
  tier: Tier;
  ownContext: OwnContext | null;
  userId: string | null; // ログインユーザー（無ければ匿名）
  anonId: string | null; // 匿名ID（Cookie 由来）
  ipHash: string; // ハッシュ済みIP（生IPは保存しない）
  date: string; // YYYYMMDD（レート制限のキー用）
}

export interface HandleResearchDeps {
  repo: ReportRepo;
  kv: KvStore;
  config: WorkerConfig;
}

export interface ResearchResponse {
  reportId: string | null; // キャッシュ返却時は既存レポート（新規行なし）
  slug: string;
  status: 'done';
  cached: boolean;
  report: ResearchReport;
}

// 共有リンク用の短いスラッグ（docs/02: 例 a7fk2x）
function makeSlug(): string {
  return Math.random().toString(36).slice(2, 8);
}

// docs/04 の処理順を厳守する:
//   1. バリデーション → 2. 正規化 → 3. キャッシュ確認（課金より前！）
//   → 4. free=レート制限 / paid=クレジット消費 → 5. レポート作成
//   → 6. 生成 → 7. 完了保存（失敗時はクレジット返還）
export async function handleResearchRequest(
  deps: HandleResearchDeps,
  input: HandleResearchInput,
): Promise<ResearchResponse> {
  const { repo, kv, config } = deps;

  // 1-2) バリデーション＋正規化（企業名は公式サイトを特定）
  if (input.inputType === 'name' && input.input.trim().length < 2) {
    throw new AppError('INVALID_INPUT', '企業名は2文字以上');
  }
  const start =
    input.inputType === 'name'
      ? await resolveNameToUrl(input.input, config)
      : normalizeUrl(input.input);
  const domain = start.host;
  const hasOwnContext = input.ownContext != null;

  // 3) キャッシュ確認は課金より前（docs/04: 順序を間違えると「キャッシュヒットなのに課金」）。
  //    自社情報つきは出力が変わるためキャッシュ対象外。
  if (!hasOwnContext) {
    const cachedReport = await repo.getRecentDoneReport(
      domain,
      input.tier,
      config.cacheTtlDays,
    );
    if (cachedReport) {
      return {
        reportId: null,
        slug: cachedReport.slug,
        status: 'done',
        cached: true,
        report: cachedReport,
      };
    }
  }

  // 4) 課金/レート制限
  if (input.tier === 'free') {
    // 匿名=2/日、ログイン済み無料=3/日、IP=10/日、全体日次上限（docs/04,06）
    const identityKey = input.userId
      ? `user:${input.userId}`
      : `anon:${input.anonId ?? 'unknown'}`;
    const identityLimit = input.userId ? 3 : 2;
    const guard = await guardGeneration(kv, {
      tier: 'free',
      identityKey,
      identityLimit,
      ipHash: input.ipHash,
      date: input.date,
      dailyGlobalLimit: config.dailyGlobalLimit,
    });
    if (!guard.allowed) throw new AppError('RATE_LIMITED');
  } else {
    // 有料はログイン必須（匿名は購入導線でログインさせる。docs/04）
    if (!input.userId) {
      throw new AppError('INSUFFICIENT_CREDIT', '有料利用にはログインが必要です');
    }
    // サーキットブレーカーは有料も通すが、グローバル計数のため通す
    await guardGeneration(kv, {
      tier: 'paid',
      identityKey: `user:${input.userId}`,
      identityLimit: 0,
      ipHash: input.ipHash,
      date: input.date,
      dailyGlobalLimit: config.dailyGlobalLimit,
    });
  }

  // 5) レポート行を作成（company を確保 → queued で INSERT）
  const companyId = await repo.ensureCompany(domain, null);
  const slug = makeSlug();
  const reportId = await repo.createReport({
    slug,
    companyId,
    tier: input.tier,
    userId: input.userId,
    anonId: input.userId ? null : input.anonId,
    ownContext: input.ownContext,
  });

  // 有料はここでクレジットを消費（キャッシュ確認の後＝docs/04 の順序）
  if (input.tier === 'paid' && input.userId) {
    const ok = await repo.consumeCredit(
      input.userId,
      reportId,
      CREDIT_PER_REPORT,
    );
    if (!ok) {
      await repo.failReport(reportId, 'INSUFFICIENT_CREDIT');
      throw new AppError('INSUFFICIENT_CREDIT');
    }
  }

  // 6-7) 生成 → 完了保存。失敗時は必ずクレジット返還（docs/02 原則）
  try {
    const result = await runResearchCached(
      {
        input: start.toString(),
        inputType: 'url',
        tier: input.tier,
        ownContext: input.ownContext,
      },
      config,
      repo,
    );
    await repo.completeReport(reportId, result);

    const nowIso = new Date().toISOString();
    const report: ResearchReport = {
      slug,
      tier: input.tier,
      status: 'done',
      errorCode: null,
      company: { name: result.facts.companyName, domain: result.domain },
      facts: result.facts,
      hypothesis: result.hypothesis,
      ownContext: input.ownContext,
      sourceUrls: result.sourceUrls,
      isPublic: false,
      createdAt: nowIso,
      completedAt: nowIso,
    };
    return { reportId, slug, status: 'done', cached: false, report };
  } catch (err) {
    // 価値ある結果を返せなかった場合はクレジットを返す（返金対応を発生させない）
    const code = err instanceof AppError ? err.code : 'AI_FAILED';
    await repo.failReport(reportId, code);
    if (input.tier === 'paid' && input.userId) {
      await repo.refundCredit(input.userId, reportId, CREDIT_PER_REPORT);
    }
    throw err;
  }
}
