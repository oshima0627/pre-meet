// ============================================================
// 型の単一情報源（docs/02, CLAUDE.md）
// Worker と Web で重複定義しないため、ドメイン型はここに集約する。
// AI 出力の型（Facts / Hypothesis）と zod スキーマも shared に置き、
// この import 一箇所（@premeet/shared）で型と検証を共有する。
// ============================================================

// AI 出力の型・zod スキーマを再輸出（単一の入口にする）
export * from './schema.js';
import type { Facts, Hypothesis } from './schema.js';

// エラーコード表（docs/04）。AppError と 1:1 で対応させる
export type ErrorCode =
  | 'INVALID_INPUT'
  | 'RATE_LIMITED'
  | 'INSUFFICIENT_CREDIT'
  | 'ROBOTS_BLOCKED'
  | 'FETCH_FAILED'
  | 'THIN_CONTENT'
  | 'AI_FAILED';

export type Tier = 'free' | 'paid';

// research_reports.status（docs/03）
export type ReportStatus =
  | 'queued'
  | 'collecting'
  | 'generating'
  | 'done'
  | 'failed';

// 収集した1ページ分の本文（Collector の出力単位）
export interface CollectedPage {
  url: string;
  // 本文はトリム済み（原価・時間の防衛線。docs/02: 1ページ8,000文字）
  text: string;
  // 取得元の種別。ニュースは Web 検索由来なので区別できるようにする。
  // case=導入事例（顧客・実績の事実源）
  kind: 'top' | 'about' | 'service' | 'case' | 'recruit' | 'news' | 'other';
}

// 自社サービス情報（US-07）。生成時点の値をスナップショットで保持する
export interface OwnContext {
  companyName: string;
  serviceSummary: string;
  targetCustomer: string;
}

// モデル呼び出し1回分の使用量。原価計測（docs/03 の cost_usd）に使う
export interface ModelUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

// リサーチレポート（research_reports 行の公開ビュー）。
// Worker が生成し、Web が表示する。両者でズレると結果表示が壊れるため
// ここを単一情報源にする（docs/02）。API レスポンス（docs/04）もこの形に揃える。
export interface ResearchReport {
  slug: string;
  tier: Tier;
  status: ReportStatus;
  errorCode: ErrorCode | null;
  company: { name: string | null; domain: string };
  facts: Facts | null; // セクション1〜4
  hypothesis: Hypothesis | null; // セクション5〜8（paid のみ）
  ownContext: OwnContext | null; // 生成時点の自社情報スナップショット
  sourceUrls: string[]; // 収集元URL（透明性のため画面に出す）
  isPublic: boolean;
  createdAt: string; // ISO8601
  completedAt: string | null;
}
