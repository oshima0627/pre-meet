import type { KvStore } from '@premeet/worker';

// KvStore アダプタ。本番は Cloudflare KV バインディング（env.RATE_LIMIT）を使う。
// ローカル/Node 開発ではプロセス内 Map で代用する（複数インスタンス間で共有されない
// 点は本番の CF KV で解消される。docs/02 の KV ベース設計）。
const mem = new Map<string, { value: string; expiresAt: number | null }>();

const memoryKv: KvStore = {
  async get(key) {
    const e = mem.get(key);
    if (!e) return null;
    if (e.expiresAt != null && e.expiresAt < Date.now()) {
      mem.delete(key);
      return null;
    }
    return e.value;
  },
  async put(key, value, opts) {
    mem.set(key, {
      value,
      expiresAt: opts?.expirationTtl ? Date.now() + opts.expirationTtl * 1000 : null,
    });
  },
};

// Cloudflare KV バインディング（本番）を包む。無ければメモリ実装にフォールバック。
export function getKv(binding?: {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}): KvStore {
  return binding ?? memoryKv;
}
