import { cookies, headers } from 'next/headers';
import { getUserId } from './supabase-server';

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

// リクエストの送信元IP（プロキシ経由を考慮）。
// レート制限は原価防衛の要（CLAUDE.md 原則1）なので、クライアントが自由に
// 詐称できる X-Forwarded-For の先頭値は信用しない。Cloudflare が付与する
// 信頼済みヘッダ（CF-Connecting-IP / True-Client-IP）を最優先で使う。
// これらが無い環境でのみ XFF 先頭にフォールバックする。
export async function getIpHash(): Promise<string> {
  const h = await headers();
  const trusted =
    h.get('cf-connecting-ip') ?? h.get('true-client-ip') ?? '';
  const fallback = (h.get('x-forwarded-for') ?? h.get('x-real-ip') ?? '')
    .split(',')[0]
    ?.trim();
  const ip = trusted.trim() || fallback || 'unknown';
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

// レポート閲覧者の識別（ログインID＋既存の匿名Cookie）。閲覧判定専用なので
// 匿名IDは「発行しない」（新規発行は生成リクエスト時のみ）。未ログイン・
// Cookie無しなら両方 null になり、非公開レポートは見られなくなる（fail-closed）。
export async function getViewerIdentity(): Promise<{
  userId: string | null;
  anonId: string | null;
}> {
  const [userId, store] = await Promise.all([getUserId(), cookies()]);
  return { userId, anonId: store.get(ANON_COOKIE)?.value ?? null };
}

// レート制限キー用の日付（UTC の YYYYMMDD）
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}
