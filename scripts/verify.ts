#!/usr/bin/env -S npx tsx
// ============================================================
// Phase 0：精度検証スクリプト（docs/08）
//   使い方:
//     npm run verify -- https://example.co.jp
//     npm run verify -- "株式会社サンプル" --name
//     npm run verify -- https://example.co.jp --tier free
//   処理: 収集 → Stage1 → Stage2 → JSON をコンソールとファイルに出力
//   ※ UI を作る前に、10社での精度検証を最優先する
// ============================================================
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  runResearch,
  loadConfig,
  loadDotenv,
  toErrorResponse,
  type ResearchInput,
} from '@premeet/worker';

// 1生成あたりの原価上限（docs/01 非機能要件: $0.15、Phase 0 合格基準: $0.10）
const COST_CAP_USD = 0.15;
const PHASE0_COST_TARGET_USD = 0.1;

interface CliArgs {
  input: string;
  inputType: 'url' | 'name';
  tier: 'free' | 'paid';
  outDir: string;
}

function parseArgs(argv: string[]): CliArgs {
  const rest = argv.slice(2);
  let input: string | undefined;
  let inputType: 'url' | 'name' = 'url';
  let tier: 'free' | 'paid' = 'paid';
  let outDir = './out';

  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--name') inputType = 'name';
    else if (a === '--tier') {
      const v = rest[++i];
      if (v === 'free' || v === 'paid') tier = v;
    } else if (a === '--out') {
      outDir = rest[++i] ?? outDir;
    } else if (a && !a.startsWith('--')) {
      input ??= a;
    }
  }

  if (!input) {
    console.error(
      'usage: npm run verify -- <URL|企業名> [--name] [--tier free|paid] [--out ./out]',
    );
    process.exit(2);
  }
  return { input, inputType, tier, outDir };
}

function slugify(domain: string): string {
  return domain.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'report';
}

async function main(): Promise<void> {
  // .env を読み込む（既存の環境変数は上書きしない）
  loadDotenv(resolve(process.cwd(), '.env'));
  const config = loadConfig();
  const args = parseArgs(process.argv);

  const req: ResearchInput = {
    input: args.input,
    inputType: args.inputType,
    tier: args.tier,
  };

  console.error(`\n▶ 検証開始: ${args.input}  (tier=${args.tier})`);
  const result = await runResearch(req, config, (step, msg) => {
    console.error(`  · [${step}] ${msg}`);
  });

  // --- コンソール出力（採点用サマリー） ---
  const { facts, hypothesis, usage } = result;
  console.error('\n===== サマリー =====');
  console.error(`社名(推定): ${facts.companyName}`);
  console.error(`ドメイン  : ${result.domain}`);
  console.error(
    `収集ページ: ${result.pages.length}件  [${result.pages
      .map((p) => p.kind)
      .join(', ')}]`,
  );
  console.error(
    `dataQuality.score: ${facts.dataQuality.score}  missing=[${facts.dataQuality.missing.join(
      ', ',
    )}]`,
  );
  console.error(
    `事実: サービス${facts.services.length} / 顧客${facts.customers.namedClients.length} / ニュース${facts.recentNews.length} / 求人${facts.hiring.openPositions.length}`,
  );
  if (hypothesis) {
    console.error(
      `仮説: 課題${hypothesis.hypotheses.length} / 切り口${hypothesis.angles.length} / 質問${hypothesis.questions.length} / 反論${hypothesis.objections.length}`,
    );
  } else if (result.thinContent) {
    console.error('仮説: THIN_CONTENT のため未生成（score < 0.3）');
  } else {
    console.error('仮説: 未生成（tier=free）');
  }

  // --- 原価チェック ---
  console.error('\n===== 原価 =====');
  console.error(
    `Stage1(${usage.stage1.model}): $${usage.stage1.costUsd.toFixed(5)}  (in=${usage.stage1.inputTokens}, out=${usage.stage1.outputTokens})`,
  );
  if (usage.stage2) {
    console.error(
      `Stage2(${usage.stage2.model}): $${usage.stage2.costUsd.toFixed(5)}  (in=${usage.stage2.inputTokens}, out=${usage.stage2.outputTokens})`,
    );
  }
  const total = usage.totalCostUsd;
  const costFlag =
    total > COST_CAP_USD
      ? '❌ 上限超過'
      : total > PHASE0_COST_TARGET_USD
        ? '△ Phase0目標($0.10)超過'
        : '✅ OK';
  console.error(`合計: $${total.toFixed(5)}  ${costFlag}`);
  console.error(`所要時間: ${(result.durationMs / 1000).toFixed(1)}s`);

  // --- ファイル出力 ---
  mkdirSync(args.outDir, { recursive: true });
  const outPath = resolve(args.outDir, `${slugify(result.domain)}.json`);
  writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8');
  console.error(`\n📄 出力: ${outPath}`);
}

main().catch((err) => {
  const { error } = toErrorResponse(err);
  console.error(`\n✗ 失敗: [${error.code}] ${error.message}`);
  if (!(error.code in { INVALID_INPUT: 1, ROBOTS_BLOCKED: 1, FETCH_FAILED: 1, THIN_CONTENT: 1 })) {
    // 想定外は原因も出す
    console.error(err);
  }
  process.exit(1);
});
