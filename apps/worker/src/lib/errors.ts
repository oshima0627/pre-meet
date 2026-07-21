import type { ErrorCode } from '@premeet/shared';

// エラーは AppError(code) に統一する（CLAUDE.md / docs/04）。
// HTTP ステータスとユーザー向け文言をコード表と一元管理し、
// 呼び出し側で文字列比較しないで済むようにする。
const ERROR_TABLE: Record<ErrorCode, { http: number; message: string }> = {
  INVALID_INPUT: { http: 400, message: 'URL/企業名が不正です' },
  RATE_LIMITED: { http: 429, message: '本日の無料利用回数を超えました' },
  INSUFFICIENT_CREDIT: { http: 402, message: 'クレジットが不足しています' },
  ROBOTS_BLOCKED: { http: 422, message: 'robots.txt により取得できませんでした' },
  FETCH_FAILED: { http: 422, message: 'サイトを取得できませんでした' },
  THIN_CONTENT: { http: 422, message: '情報量が不足しているため生成を中止しました' },
  AI_FAILED: { http: 500, message: '生成に失敗しました（クレジットは返還されます）' },
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly http: number;

  constructor(code: ErrorCode, detail?: string) {
    const entry = ERROR_TABLE[code];
    // detail は運用ログ用。ユーザーには code 由来の定型文言を返す
    super(detail ? `${entry.message}（${detail}）` : entry.message);
    this.name = 'AppError';
    this.code = code;
    this.http = entry.http;
  }
}

// レスポンス統一形式（docs/04）
export function toErrorResponse(err: unknown): {
  error: { code: ErrorCode | 'UNKNOWN'; message: string };
} {
  if (err instanceof AppError) {
    return { error: { code: err.code, message: err.message } };
  }
  return { error: { code: 'UNKNOWN', message: '想定外のエラーが発生しました' } };
}
