import type { KvStore } from '@premeet/worker';

// Cloudflare の実行コンテキスト（waitUntil）を取り出す。レスポンス返却後も背景処理を
// 継続させて生成を完了させるために使う（同期リクエストの90秒の壁を回避）。
// CF 外（next dev / build）では undefined を返す。
export async function getExecutionCtx(): Promise<
  { waitUntil(p: Promise<unknown>): void } | undefined
> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const { ctx } = getCloudflareContext();
    return ctx && typeof ctx.waitUntil === 'function' ? ctx : undefined;
  } catch {
    return undefined;
  }
}

// Cloudflare Workers の KV バインディング（RATE_LIMIT）を取り出す。
// CF 実行時のみ存在し、ローカル next dev / 通常ビルドでは undefined を返す。
export async function getRateLimitKv(): Promise<KvStore | undefined> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = getCloudflareContext();
    const kv = ctx.env.RATE_LIMIT;
    if (!kv) return undefined;
    // KVNamespace は get/put が KvStore と構造的に一致する
    return kv as unknown as KvStore;
  } catch {
    // CF 外（next dev / next build）ではバインディングが無い
    return undefined;
  }
}
