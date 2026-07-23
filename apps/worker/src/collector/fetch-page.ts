import { USER_AGENT } from './robots.js';
import { AppError } from '../lib/errors.js';
import { assertPublicUrl } from './ssrf.js';

// 1ページあたりの本文上限の既定（docs/02: 8,000文字）。
// 実運用では config.maxPageChars で上書きする（原価チューニングのため）。
export const DEFAULT_PAGE_CHARS = 8_000;

// リダイレクトの最大追跡数。無限ループ・遅延攻撃を避ける。
const MAX_REDIRECTS = 5;

export interface FetchedPage {
  url: string;
  status: number;
  html: string;
}

// タイムアウト付きの単一ページ取得。UA を明示する。
// SSRF対策として、初回URL＋各リダイレクト先を毎回 assertPublicUrl で検証する
// （redirect:'follow' だと内部アドレスへリダイレクトで抜けられるため手動追跡）。
export async function fetchRaw(
  url: string,
  timeoutMs = 10_000,
): Promise<FetchedPage> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let current = new URL(url);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      // 取得直前に必ず検証する（DNSリバインディング・リダイレクト回避を塞ぐ）
      await assertPublicUrl(current, 'FETCH_FAILED');
      const res = await fetch(current, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,*/*' },
        redirect: 'manual',
        signal: controller.signal,
      });
      // 3xx は Location を自前で解決して次ホップへ（相対URLも吸収）
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (!loc) return { url: current.toString(), status: res.status, html: '' };
        current = new URL(loc, current);
        continue;
      }
      const html = await res.text();
      return { url: current.toString(), status: res.status, html };
    }
    // リダイレクトが多すぎるサイトは取得失敗扱い（原価・時間の暴走を防ぐ）
    throw new AppError('FETCH_FAILED', 'リダイレクトが多すぎます');
  } finally {
    clearTimeout(timer);
  }
}

// よく使う HTML エンティティのみデコード（依存を増やさない最小実装）
const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

// HTML から本文テキストを抽出する。script/style を捨て、タグを除去し、
// 空白を畳んで maxChars でトリムする。
export function htmlToText(html: string, maxChars = DEFAULT_PAGE_CHARS): string {
  let text = html
    // 本文にならない要素を丸ごと除去
    .replace(/<(script|style|noscript|template|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    // 改行になるべきブロック境界を保持
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|br)>/gi, '\n')
    // 残りのタグを除去
    .replace(/<[^>]+>/g, ' ');

  // エンティティのデコード
  text = text.replace(
    /&(amp|lt|gt|quot|#39|apos|nbsp);/g,
    (m) => ENTITIES[m] ?? m,
  );
  // 数値文字参照（10進 &#39; / 16進 &#x27;）をデコード
  text = text.replace(/&#(\d+);/g, (_, code: string) =>
    String.fromCodePoint(Number(code)),
  );
  text = text.replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
    String.fromCodePoint(parseInt(hex, 16)),
  );

  // 空白の正規化：行内の連続空白を1つに、空行を圧縮
  text = text
    .split('\n')
    .map((line) => line.replace(/[^\S\n]+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');

  return text.slice(0, maxChars);
}

// HTML から <title> を1つ取り出す（企業名の当たり・検索クエリ生成に使う）
export function extractTitle(html: string): string | null {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!m || m[1] === undefined) return null;
  const t = htmlToText(m[1]).replace(/\n/g, ' ').trim();
  return t || null;
}

// HTML から同一ホストの内部リンク（href）を集める
export function extractLinks(html: string, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const out = new Set<string>();
  const re = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    if (!href || href.startsWith('#')) continue;
    if (/^(mailto:|tel:|javascript:)/i.test(href)) continue;
    try {
      const u = new URL(href, base);
      if (u.host !== base.host) continue; // 同一ホストのみ
      u.hash = '';
      out.add(u.toString());
    } catch {
      // 不正なURLは無視
    }
  }
  return [...out];
}
