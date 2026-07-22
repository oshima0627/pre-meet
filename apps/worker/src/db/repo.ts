import type {
  ErrorCode,
  Facts,
  OwnContext,
  ResearchReport,
  Tier,
} from '@premeet/shared';
import type { ResearchResult } from '../pipeline.js';

// 会社キャッシュ（Stage1 の facts）。7日以内なら収集＋Stage1 を省略できる（docs/02）。
export interface CachedCompany {
  name: string | null;
  facts: Facts;
  sourceUrls: string[];
}

export interface CreateReportInput {
  slug: string;
  companyId: string;
  tier: Tier;
  userId: string | null;
  anonId: string | null;
  ownContext: OwnContext | null;
}

// 永続化の依存を抽象化する（Supabase 実装と、テスト用フェイクを差し替え可能にする）。
// これにより BFF の処理順（キャッシュ→課金→生成→永続化→返還）をオフライン検証できる。
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

  // --- レポート/課金（BFF 用） ---
  // ドメインの会社行を確保して company_id を返す（無ければ作成）。
  ensureCompany(domain: string, name: string | null): Promise<string>;
  // 同一ドメイン・同一tierの「done」レポートが ttlDays 以内にあれば返す（無ければ null）。
  // 自社情報つき（ownContext）は出力が変わるためキャッシュ対象外にする。
  getRecentDoneReport(
    domain: string,
    tier: Tier,
    ttlDays: number,
  ): Promise<ResearchReport | null>;
  createReport(input: CreateReportInput): Promise<string>; // 返り値=report_id（status=queued）
  completeReport(reportId: string, result: ResearchResult): Promise<void>;
  failReport(reportId: string, errorCode: ErrorCode): Promise<void>;

  // クレジット消費/返還（RPC）。残高不足なら consume は false。
  consumeCredit(userId: string, reportId: string, amount: number): Promise<boolean>;
  refundCredit(userId: string, reportId: string, amount: number): Promise<boolean>;
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
