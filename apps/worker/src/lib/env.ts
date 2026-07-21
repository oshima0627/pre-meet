import { readFileSync } from 'node:fs';

// 環境変数は必ず型付きで読む（CLAUDE.md）。process.env.X! を直に書かない。

export type ThinkingMode = 'disabled' | 'adaptive';

export interface ModelPricing {
  // 1トークンあたりの USD 単価
  inputPerToken: number;
  outputPerToken: number;
}

export interface WorkerConfig {
  anthropicApiKey: string;
  modelStage1: string;
  modelStage2: string;
  stage2Thinking: ThinkingMode;
  searchProvider: string;
  searchApiKey: string | null;
}

// モデル別の価格表（$/1M トークン → $/トークン）。
// 価格は変動するため、実装時に公式ドキュメントで最新を確認すること（docs/05）。
// 原価の上振れを検知するため、未知モデルは高めの既定値でガードする。
const PRICING_PER_MTOK: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-sonnet-5': { input: 3, output: 15 },
  'claude-opus-4-8': { input: 5, output: 25 },
};
const FALLBACK_PRICING = { input: 15, output: 75 };

export function getPricing(model: string): ModelPricing {
  const p = PRICING_PER_MTOK[model] ?? FALLBACK_PRICING;
  return {
    inputPerToken: p.input / 1_000_000,
    outputPerToken: p.output / 1_000_000,
  };
}

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v || v.trim() === '') {
    throw new Error(`環境変数 ${key} が未設定です（.env.example を参照）`);
  }
  return v.trim();
}

function optionalEnv(key: string, fallback: string): string {
  const v = process.env[key];
  return v && v.trim() !== '' ? v.trim() : fallback;
}

export function loadConfig(): WorkerConfig {
  const thinking = optionalEnv('MODEL_STAGE2_THINKING', 'disabled');
  return {
    anthropicApiKey: requireEnv('ANTHROPIC_API_KEY'),
    modelStage1: optionalEnv('MODEL_STAGE1', 'claude-haiku-4-5'),
    modelStage2: optionalEnv('MODEL_STAGE2', 'claude-sonnet-5'),
    stage2Thinking: thinking === 'adaptive' ? 'adaptive' : 'disabled',
    searchProvider: optionalEnv('SEARCH_PROVIDER', 'brave'),
    searchApiKey: process.env.SEARCH_API_KEY?.trim() || null,
  };
}

// 依存を増やさない最小の .env ローダー（Phase 0 のCLI用）。
// KEY=VALUE 形式のみ。既に process.env にある値は上書きしない。
export function loadDotenv(path: string): void {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return; // ファイルが無ければ何もしない
  }
  // 先頭のBOMを除去（Windowsのメモ帳でUTF-8保存すると付き、
  // 1行目のキー名にBOMが混じって未設定扱いになるのを防ぐ）
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    // 前後のクォートを剥がす
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
