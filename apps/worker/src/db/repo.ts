import type { Facts } from '@premeet/shared';

// 会社キャッシュ（Stage1 の facts）。7日以内なら収集＋Stage1 を省略できる（docs/02）。
export interface CachedCompany {
  name: string | null;
  facts: Facts;
  sourceUrls: string[];
}

// 永続化の依存を抽象化する（Supabase 実装と、テスト用フェイクを差し替え可能にする）。
// これにより原価防衛の中核＝キャッシュ判定をオフラインで検証できる。
export interface ReportRepo {
  // ttlDays 以内に生成された会社の facts を返す。無ければ null。
  getFreshCompany(domain: string, ttlDays: number): Promise<CachedCompany | null>;
  // 生成した facts を company に upsert してキャッシュを更新する。
  saveCompanyFacts(input: {
    domain: string;
    name: string | null;
    facts: Facts;
    sourceUrls: string[];
    crawlBlocked?: boolean;
  }): Promise<void>;
}

// generated_at が ttlDays 以内なら新鮮とみなす（純関数。テスト容易）。
export function isCacheFresh(
  generatedAt: string | null,
  ttlDays: number,
  now: number,
): boolean {
  if (!generatedAt) return false;
  const ts = Date.parse(generatedAt);
  if (Number.isNaN(ts)) return false;
  const ageMs = now - ts;
  return ageMs >= 0 && ageMs <= ttlDays * 24 * 60 * 60 * 1000;
}
