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

// beginResearch の結果。キャッシュヒットは即結果、そうでなければ queued ハンドルを返し、
// 実生成は finishResearch（背景実行）に委ねる（同期リクエストの90秒の壁を外す）。
export type BeginResult =
  | { kind: 'cached'; slug: string; report: ResearchReport }
  | { kind: 'queued'; reportId: string; slug: string; startUrl: string };

// 自社URLが指定されていれば、その公開情報（Stage1 facts）から自社文脈を補完する。
// 自社factsは会社単位キャッシュ（getFreshCompany）が効くので、同じ売り手の
// 繰り返し利用はほぼ無償＝原価防衛と両立する。取得失敗は致命ではない
// （用途だけ渡して続行する）。手入力があればそれを優先する。
async function resolveOwnContext(
  own: OwnContext | null,
  config: WorkerConfig,
  repo: ReportRepo,
): Promise<OwnContext | null> {
  if (!own?.ownUrl) return own;
  try {
    const start = normalizeUrl(own.ownUrl);
    // tier=free で呼ぶと Stage2 は走らず facts のみ得られる（安価モデル1回）
    const res = await runResearchCached(
      { input: start.toString(), inputType: 'url', tier: 'free', ownContext: null },
      config,
      repo,
    );
    const f = res.facts;
    return {
      ...own,
      companyName: own.companyName ?? f.companyName,
      serviceSummary: own.serviceSummary ?? f.summary,
      targetCustomer:
        own.targetCustomer ?? (f.customers.segments.join('、') || null),
    };
  } catch {
    return own;
  }
}

// 共有リンク用のスラッグ。推測・総当たりで他人のレポートを引けないよう、
// Math.random ではなく暗号乱数から十分な長さ（22文字≒131bit）で作る。
// （非公開判定は getReportBySlug 側でも行うが、識別子自体も予測不能にする）
const SLUG_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
function makeSlug(): string {
  const bytes = new Uint8Array(22);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += SLUG_ALPHABET[b % SLUG_ALPHABET.length];
  return out;
}

// 前半（同期・リクエスト内で完結）: docs/04 の処理順を厳守する。
//   1. バリデーション → 2. 正規化 → 3. キャッシュ確認（課金より前！）
//   → 4. free=レート制限 / paid=クレジット消費 → 5. レポート作成(queued)
// キャッシュヒットは即結果、それ以外は queued ハンドルを返す。実生成は finishResearch へ。
export async function beginResearch(
  deps: HandleResearchDeps,
  input: HandleResearchInput,
): Promise<BeginResult> {
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
      return { kind: 'cached', slug: cachedReport.slug, report: cachedReport };
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

  return { kind: 'queued', reportId, slug, startUrl: start.toString() };
}

// 後半（背景実行）: 収集→Stage1→Stage2→完了保存。同期リクエストから切り離して
// 実行することで、90秒の壁を越える大きめのデータでも完了できる（waitUntil で駆動）。
// 例外は投げず内部で処理する（失敗時は failed マーク＋有料はクレジット返還）。
export async function finishResearch(
  deps: HandleResearchDeps,
  input: HandleResearchInput,
  reportId: string,
  startUrl: string,
): Promise<void> {
  const { repo, config } = deps;
  // 自社URLがあれば公開情報から自社文脈を補完してから生成する（用途と併用）。
  const effectiveOwn = await resolveOwnContext(input.ownContext, config, repo);
  try {
    const result = await runResearchCached(
      {
        input: startUrl,
        inputType: 'url',
        tier: input.tier,
        ownContext: effectiveOwn,
      },
      config,
      repo,
    );
    await repo.completeReport(reportId, result, effectiveOwn);
  } catch (err) {
    // 価値ある結果を返せなかった場合はクレジットを返す（返金対応を発生させない）
    const code = err instanceof AppError ? err.code : 'AI_FAILED';
    try {
      await repo.failReport(reportId, code);
      if (input.tier === 'paid' && input.userId) {
        await repo.refundCredit(input.userId, reportId, CREDIT_PER_REPORT);
      }
    } catch (e) {
      // 後始末自体の失敗は /reports の reconcileStaleReports が拾う
      console.error('[finishResearch] 後始末に失敗:', e);
    }
  }
}
