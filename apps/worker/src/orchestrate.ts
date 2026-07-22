import type { WorkerConfig } from './lib/env.js';
import {
  runResearch,
  type CachedFacts,
  type ResearchInput,
  type ResearchResult,
  type OnProgress,
} from './pipeline.js';
import { normalizeUrl } from './collector/discover.js';
import type { ReportRepo } from './db/repo.js';

// 7日キャッシュを効かせて runResearch を呼ぶ（docs/02 の原価防衛の要）。
// URL入力のみキャッシュ対象にする（ドメインをネットワークなしで確定できるため）。
// 企業名入力は公式サイト特定に検索が要るので、初回はそのまま生成する。
export async function runResearchCached(
  args: ResearchInput,
  config: WorkerConfig,
  repo: ReportRepo,
  onProgress: OnProgress = () => {},
): Promise<ResearchResult> {
  let cached: CachedFacts | undefined;

  if (args.inputType === 'url') {
    let domain: string | null = null;
    try {
      domain = normalizeUrl(args.input).host;
    } catch {
      domain = null; // 不正URLは runResearch 側で INVALID_INPUT にさせる
    }
    if (domain) {
      const hit = await repo.getFreshCompany(domain, config.cacheTtlDays);
      if (hit) {
        onProgress('collecting', '7日以内のキャッシュを利用します');
        cached = { facts: hit.facts, sourceUrls: hit.sourceUrls };
      }
    }
  }

  const result = await runResearch(args, config, onProgress, cached);

  // 新規生成なら facts をキャッシュに保存（次回の収集＋Stage1 を省く）。
  // 保存失敗は致命ではない（次回また生成すればよいだけ）ので握りつぶす。
  if (!result.cacheHit) {
    try {
      await repo.saveCompanyFacts({
        domain: result.domain,
        name: result.facts.companyName,
        facts: result.facts,
        sourceUrls: result.sourceUrls,
      });
    } catch {
      /* noop: キャッシュ保存の失敗は無視 */
    }
  }

  return result;
}
