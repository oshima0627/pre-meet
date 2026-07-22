// ============================================================
// レート制限＋サーキットブレーカー（docs/04, docs/06）
//   無人運用で原価が暴走しないための最後の砦。純ロジック＋KV抽象で
//   テスト可能にする（Cloudflare KV バインディングを差し替えられる）。
// ============================================================

// Cloudflare Workers KV バインディング相当の最小インターフェース。
// （KV に原子的インクリメントは無いため get→put で近似する。docs/02 の想定どおり）
export interface KvStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

// レート制限の定数（docs/04）
export const FREE_ANON_DAILY_LIMIT = 2; // 匿名：1日2回
export const FREE_USER_DAILY_LIMIT = 3; // ログイン済み無料：1日3回
export const IP_DAILY_LIMIT = 10; // IP単位：1日10回（Cookie削除による回避を防ぐ）
export const RL_TTL_SECONDS = 48 * 60 * 60; // 48時間で自動失効（docs/04）

async function readCount(kv: KvStore, key: string): Promise<number> {
  const v = await kv.get(key);
  const n = v ? Number(v) : 0;
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

async function bump(kv: KvStore, key: string, current: number): Promise<void> {
  await kv.put(key, String(current + 1), { expirationTtl: RL_TTL_SECONDS });
}

export type GuardResult =
  | { allowed: true }
  // reason は運用ログ用。ユーザーには一律 RATE_LIMITED を返す（docs/04）
  | { allowed: false; reason: 'ip' | 'identity' | 'global' };

export interface FreeLimitInput {
  identityKey: string; // 例: `anon:${anonId}` または `user:${userId}`
  identityLimit: number; // 匿名=2 / ログイン済み無料=3
  ipHash: string; // ハッシュ済みIP（生IPは保存しない）
  date: string; // YYYYMMDD（呼び出し側でUTC等を確定して渡す）
}

// 無料層のレート制限。本人上限とIP上限の両方を見る。
// 超過時は加算しない（拒否）。許可時のみ本人＋IPを +1 する。
export async function checkFreeRateLimit(
  kv: KvStore,
  input: FreeLimitInput,
): Promise<GuardResult> {
  const idKey = `rl:${input.identityKey}:${input.date}`;
  const ipKey = `rl:ip:${input.ipHash}:${input.date}`;
  const [idCount, ipCount] = await Promise.all([
    readCount(kv, idKey),
    readCount(kv, ipKey),
  ]);

  // IPを先に見る（Cookie削除・匿名IDリセットでの回避を塞ぐのが主目的）
  if (ipCount >= IP_DAILY_LIMIT) return { allowed: false, reason: 'ip' };
  if (idCount >= input.identityLimit) return { allowed: false, reason: 'identity' };

  await Promise.all([bump(kv, idKey, idCount), bump(kv, ipKey, ipCount)]);
  return { allowed: true };
}

// サーキットブレーカー：全体の1日生成数が上限に達したら無料を止める（有料は通す）。
// 生成する分だけグローバルカウンタを加算する。
export async function checkCircuitBreaker(
  kv: KvStore,
  tier: 'free' | 'paid',
  date: string,
  dailyGlobalLimit: number,
): Promise<GuardResult> {
  const key = `global:${date}`;
  const count = await readCount(kv, key);

  // 想定外トラフィック/攻撃で原価が暴走するのを止める最後の砦（docs/06）
  if (tier === 'free' && count >= dailyGlobalLimit) {
    return { allowed: false, reason: 'global' };
  }
  await bump(kv, key, count);
  return { allowed: true };
}

export interface GuardInput {
  tier: 'free' | 'paid';
  identityKey: string;
  identityLimit: number;
  ipHash: string;
  date: string;
  dailyGlobalLimit: number;
}

// 生成前の総合ゲート。無料は「本人/IP上限 → 全体上限」の順で判定する。
// レート制限に引っかかった無料はグローバルを加算しない（無駄な加算を避ける）。
export async function guardGeneration(
  kv: KvStore,
  input: GuardInput,
): Promise<GuardResult> {
  if (input.tier === 'free') {
    const rl = await checkFreeRateLimit(kv, {
      identityKey: input.identityKey,
      identityLimit: input.identityLimit,
      ipHash: input.ipHash,
      date: input.date,
    });
    if (!rl.allowed) return rl;
  }
  return checkCircuitBreaker(kv, input.tier, input.date, input.dailyGlobalLimit);
}
