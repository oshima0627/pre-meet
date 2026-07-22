// Worker パッケージの公開エントリ。Phase 0 の検証スクリプトと
// 将来の Queue コンシューマ（apps/worker/src/consumer.ts）から使う。
export { runResearch } from './pipeline.js';
export type {
  ResearchInput,
  ResearchResult,
  OnProgress,
  CachedFacts,
} from './pipeline.js';
export { runResearchCached } from './orchestrate.js';
export { loadConfig, loadDotenv, getPricing } from './lib/env.js';
export type { WorkerConfig } from './lib/env.js';
export { AppError, toErrorResponse } from './lib/errors.js';
export { FactsSchema, HypothesisSchema } from './ai/schema.js';
export type { Facts, Hypothesis } from './ai/schema.js';
// 永続化・キャッシュ（Phase 1）
export { isCacheFresh } from './db/repo.js';
export type { ReportRepo, CachedCompany } from './db/repo.js';
export { createSupabaseRepo } from './db/supabase-repo.js';
