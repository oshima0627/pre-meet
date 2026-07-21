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
  sourceUrls: string[];
  pages: Array<Pick<CollectedPage, 'url' | 'kind'>>;
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

// 収集 → Stage1 → Stage2 の一連の処理。事実と推測を段階で分離する（docs/02）。
export async function runResearch(
  args: ResearchInput,
  config: WorkerConfig,
  onProgress: OnProgress = () => {},
): Promise<ResearchResult> {
  const startedAt = Date.now();

  // 1) 入力の正規化
  const start =
    args.inputType === 'name'
      ? await resolveNameToUrl(args.input, config)
      : normalizeUrl(args.input);

  // 2) 収集（Collector）
  onProgress('collecting', 'サイトを取得しています');
  const collected = await collectSite(start);
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

  const client = createAnthropic(config.anthropicApiKey);

  // 3) Stage1：事実抽出（安価モデル・thinking なし）
  onProgress('analyzing', '事実情報を抽出しています');
  const stage1 = await runStructured(
    client,
    {
      model: config.modelStage1,
      prompt: buildStage1Prompt(pages),
      schema: FactsSchema,
    },
    { thinking: 'disabled', maxTokens: 8_000 },
  );
  const facts = stage1.data;

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

  const totalCostUsd = stage1.usage.costUsd + (stage2Usage?.costUsd ?? 0);
  return {
    domain: start.host,
    tier: args.tier,
    facts,
    hypothesis,
    thinContent,
    sourceUrls: collected.sourceUrls,
    pages: pages.map((p) => ({ url: p.url, kind: p.kind })),
    usage: { stage1: stage1.usage, stage2: stage2Usage, totalCostUsd },
    durationMs: Date.now() - startedAt,
  };
}
