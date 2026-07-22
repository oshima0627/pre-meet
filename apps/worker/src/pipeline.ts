import type {
  CollectedPage,
  ModelUsage,
  OwnContext,
  Tier,
} from '@premeet/shared';
import type { WorkerConfig } from './lib/env.js';
import { AppError } from './lib/errors.js';
import { createAnthropic, runStructured } from './ai/anthropic.js';
import { FactsSchema, HypothesisSchema, type Facts, type Hypothesis } from './ai/schema.js';
import { buildStage1Prompt } from './ai/stage1-facts.js';
import { buildStage2Prompt } from './ai/stage2-hypothesis.js';
import { collectSite, normalizeUrl } from './collector/discover.js';
import { prepareForStage1 } from './collector/prepare.js';
import { webSearch } from './collector/search.js';

// dataQuality がこの値未満なら仮説構築を行わない（docs/05）
const THIN_CONTENT_SCORE = 0.3;

export interface ResearchInput {
  input: string;
  inputType: 'url' | 'name';
  tier: Tier;
  ownContext?: OwnContext | null;
}

export interface ResearchResult {
  domain: string;
  tier: Tier;
  facts: Facts;
  hypothesis: Hypothesis | null;
  // 情報不足で仮説構築を中止したか（true のとき本番ではクレジットを返す）
  thinContent: boolean;
  // 会社キャッシュ（7日以内の facts）を再利用したか（原価ゼロ）
  cacheHit: boolean;
  sourceUrls: string[];
  pages: Array<Pick<CollectedPage, 'url' | 'kind'>>;
  // Stage1 へ実際に渡した本文の総文字数（原価チューニングの効果確認用）
  stage1InputChars: number;
  usage: {
    stage1: ModelUsage;
    stage2: ModelUsage | null;
    totalCostUsd: number;
  };
  durationMs: number;
}

type ProgressStep = 'collecting' | 'analyzing' | 'generating' | 'done';
export type OnProgress = (step: ProgressStep, message: string) => void;

// 企業名入力を公式サイトURLに解決する（第1候補を採用。docs/02 Step1）
async function resolveNameToUrl(
  name: string,
  config: WorkerConfig,
): Promise<URL> {
  const results = await webSearch(`${name} 公式サイト`, config, 3);
  const first = results[0];
  if (!first) {
    throw new AppError(
      'INVALID_INPUT',
      '企業名から公式サイトを特定できませんでした（SEARCH_API_KEY を設定してください）',
    );
  }
  return normalizeUrl(first.url);
}

// 7日以内キャッシュ（Stage1 の facts）を注入するための入力。
// これがあると収集＋Stage1 をスキップして原価を大きく削る（docs/02）。
export interface CachedFacts {
  facts: Facts;
  sourceUrls: string[];
}

// 収集 → Stage1 → Stage2 の一連の処理。事実と推測を段階で分離する（docs/02）。
// cached が渡された場合は収集＋Stage1 を省略し、キャッシュされた facts を使う。
export async function runResearch(
  args: ResearchInput,
  config: WorkerConfig,
  onProgress: OnProgress = () => {},
  cached?: CachedFacts,
): Promise<ResearchResult> {
  const startedAt = Date.now();

  // 1) 入力の正規化
  const start =
    args.inputType === 'name'
      ? await resolveNameToUrl(args.input, config)
      : normalizeUrl(args.input);

  const client = createAnthropic(config.anthropicApiKey);

  // 事実（Stage1 相当）を用意する。キャッシュがあれば収集＋Stage1 を省略する。
  let facts: Facts;
  let sourceUrls: string[];
  let stage1Usage: ModelUsage;
  let stage1InputChars: number;
  let resultPages: Array<{ url: string; kind: CollectedPage['kind'] }>;
  const cacheHit = cached != null;

  if (cached) {
    onProgress('analyzing', 'キャッシュから事実情報を再利用しています');
    facts = cached.facts;
    sourceUrls = cached.sourceUrls;
    // キャッシュ利用時は新たな入力トークンが無いので原価ゼロ
    stage1Usage = { model: 'cache', inputTokens: 0, outputTokens: 0, costUsd: 0 };
    stage1InputChars = 0;
    resultPages = sourceUrls.map((url) => ({ url, kind: 'other' as const }));
  } else {
    // 2) 収集（Collector）。ページ数・本文長は原価防衛のため config で制御
    onProgress('collecting', 'サイトを取得しています');
    const collected = await collectSite(start, {
      maxPages: config.maxPages,
      maxPageChars: config.maxPageChars,
    });
    const pages: CollectedPage[] = [...collected.pages];

    // ニュースは サイト内 + Web検索API（docs/02）。検索は失敗してもスキップ可
    const newsQuery = `${collected.siteTitle ?? start.host} ニュース プレスリリース`;
    onProgress('collecting', '関連ニュースを確認しています');
    const news = await webSearch(newsQuery, config, 5);
    for (const n of news) {
      pages.push({ url: n.url, text: `${n.title}\n${n.snippet}`, kind: 'news' });
    }

    // 収集情報が極端に少なければ生成しない（docs/02: クレジット消費なし）
    const totalChars = pages.reduce((sum, p) => sum + p.text.length, 0);
    if (pages.length <= 1 && totalChars < 300) {
      throw new AppError('THIN_CONTENT', '収集できた情報が極端に少ないです');
    }

    // Stage1 の前に本文を圧縮（定型文除去＋総量上限）。原価の主因＝入力を削る
    const prepared = prepareForStage1(pages, config.maxTotalChars);

    // 3) Stage1：事実抽出（安価モデル・thinking なし）
    onProgress('analyzing', '事実情報を抽出しています');
    const stage1 = await runStructured(
      client,
      {
        model: config.modelStage1,
        prompt: buildStage1Prompt(prepared.pages),
        schema: FactsSchema,
      },
      { thinking: 'disabled', maxTokens: 8_000 },
    );
    facts = stage1.data;
    sourceUrls = collected.sourceUrls;
    stage1Usage = stage1.usage;
    stage1InputChars = prepared.totalChars;
    resultPages = pages.map((p) => ({ url: p.url, kind: p.kind }));
  }

  // dataQuality が低ければ仮説は作らない（無理に作ると的外れになる）
  const thinContent = facts.dataQuality.score < THIN_CONTENT_SCORE;

  // 4) Stage2：仮説構築（有料のみ・facts JSON だけを入力）
  let stage2Usage: ModelUsage | null = null;
  let hypothesis: Hypothesis | null = null;
  if (args.tier === 'paid' && !thinContent) {
    onProgress('generating', '仮説と切り口を組み立てています');
    const stage2 = await runStructured(
      client,
      {
        model: config.modelStage2,
        prompt: buildStage2Prompt(facts, args.ownContext ?? null),
        schema: HypothesisSchema,
      },
      { thinking: config.stage2Thinking, maxTokens: 12_000 },
    );
    hypothesis = stage2.data;
    stage2Usage = stage2.usage;
  }

  onProgress('done', '完了しました');

  const totalCostUsd = stage1Usage.costUsd + (stage2Usage?.costUsd ?? 0);
  return {
    domain: start.host,
    tier: args.tier,
    facts,
    hypothesis,
    thinContent,
    cacheHit,
    sourceUrls,
    pages: resultPages,
    stage1InputChars,
    usage: { stage1: stage1Usage, stage2: stage2Usage, totalCostUsd },
    durationMs: Date.now() - startedAt,
  };
}
