import { USER_AGENT } from './robots.js';

// 1ページあたりの本文上限（docs/02: 8,000文字でトリム）。原価・時間の防衛線。
export const MAX_TEXT_CHARS = 8_000;

export interface FetchedPage {
  url: string;
  status: number;
  html: string;
}

// タイムアウト付きの単一ページ取得。UA を明示する。
export async function fetchRaw(
  url: string,
  timeoutMs = 10_000,
): Promise<FetchedPage> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,*/*' },
      redirect: 'follow',
      signal: controller.signal,
    });
    const html = await res.text();
    return { url: res.url || url, status: res.status, html };
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
// 空白を畳んで MAX_TEXT_CHARS でトリムする。
export function htmlToText(html: string): string {
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
  // 数値文字参照（10進）を簡易デコード
  text = text.replace(/&#(\d+);/g, (_, code: string) =>
    String.fromCodePoint(Number(code)),
  );

  // 空白の正規化：行内の連続空白を1つに、空行を圧縮
  text = text
    .split('\n')
    .map((line) => line.replace(/[^\S\n]+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');

  return text.slice(0, MAX_TEXT_CHARS);
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
