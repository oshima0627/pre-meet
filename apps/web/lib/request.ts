import { cookies, headers } from 'next/headers';

// 匿名IDの Cookie 名（docs/04）
const ANON_COOKIE = 'pm_anon';

// 生IPは保存しない。KVキー用に安定な非可逆ハッシュ（FNV-1a）を作る。
export function hashIp(ip: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < ip.length; i++) {
    h ^= ip.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

// リクエストの送信元IP（プロキシ経由を考慮）
export async function getIpHash(): Promise<string> {
  const h = await headers();
  const fwd = h.get('x-forwarded-for') ?? h.get('x-real-ip') ?? '';
  const ip = fwd.split(',')[0]?.trim() || 'unknown';
  return hashIp(ip);
}

// 匿名ID（Cookie）。無ければ発行する。返り値の setCookie を呼び出し側で使う。
export async function getOrCreateAnonId(): Promise<{
  anonId: string;
  isNew: boolean;
}> {
  const store = await cookies();
  const existing = store.get(ANON_COOKIE)?.value;
  if (existing) return { anonId: existing, isNew: false };
  const anonId = crypto.randomUUID();
  return { anonId, isNew: true };
}

export function setAnonCookie(anonId: string): {
  name: string;
  value: string;
  options: { httpOnly: boolean; sameSite: 'lax'; maxAge: number; path: string };
} {
  return {
    name: ANON_COOKIE,
    value: anonId,
    options: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365, // 1年
      path: '/',
    },
  };
}

// レート制限キー用の日付（UTC の YYYYMMDD）
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}
