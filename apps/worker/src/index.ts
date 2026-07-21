// Worker パッケージの公開エントリ。Phase 0 の検証スクリプトと
// 将来の Queue コンシューマ（apps/worker/src/consumer.ts）から使う。
export { runResearch } from './pipeline.js';
export type {
  ResearchInput,
  ResearchResult,
  OnProgress,
} from './pipeline.js';
export { loadConfig, loadDotenv, getPricing } from './lib/env.js';
export type { WorkerConfig } from './lib/env.js';
export { AppError, toErrorResponse } from './lib/errors.js';
export { FactsSchema, HypothesisSchema } from './ai/schema.js';
export type { Facts, Hypothesis } from './ai/schema.js';
