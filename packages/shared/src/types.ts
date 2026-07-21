// ============================================================
// 型の単一情報源（docs/02, CLAUDE.md）
// Worker と Web で重複定義しないため、ドメイン型はここに集約する。
// ※ AI 出力の型（Facts / Hypothesis）は zod スキーマから導出するため
//   apps/worker/src/ai/schema.ts を単一情報源とする（そちらも一箇所定義）。
// ============================================================

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
  // 取得元の種別。ニュースは Web 検索由来なので区別できるようにする
  kind: 'top' | 'about' | 'service' | 'recruit' | 'news' | 'other';
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
