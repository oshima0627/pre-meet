import type { CollectedPage } from '@premeet/shared';
import { AppError } from '../lib/errors.js';
import {
  fetchRaw,
  htmlToText,
  extractTitle,
  extractLinks,
  DEFAULT_PAGE_CHARS,
} from './fetch-page.js';
import { parseRobots, isAllowed, type RobotsRules } from './robots.js';

// 取得ページ数の既定上限（docs/02）。実運用では config で上書きする。
export const DEFAULT_MAX_PAGES = 10;
// 同一ドメインへのリクエストは1秒に1回まで（docs/02, docs/07）
const MIN_INTERVAL_MS = 1_000;

// 収集の原価・時間パラメータ（呼び出し側＝config から渡す）
export interface CollectOptions {
  maxPages: number;
  maxPageChars: number;
}

export interface CollectResult {
  pages: CollectedPage[];
  sourceUrls: string[];
  // 検索クエリの当たりに使う（<title> or ドメイン）
  siteTitle: string | null;
}

// 入力URLの正規化：https 補完・末尾スラッシュ除去（docs/02 Step1）
export function normalizeUrl(input: string): URL {
  let s = input.trim();
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw new AppError('INVALID_INPUT', 'URL形式が不正です');
  }
  if (u.pathname !== '/' && u.pathname.endsWith('/')) {
    u.pathname = u.pathname.replace(/\/+$/, '');
  }
  return u;
}

// パスから収集種別を推定する（キーワードの前方一致）。
// 求人逆算・事例は差別化の本体なので取りこぼしを減らす（docs/README, docs/08）。
function kindForPath(pathname: string): CollectedPage['kind'] | null {
  const p = pathname.toLowerCase();
  // 採用は最優先で拾う（求人からの課題逆算が価値の中核）
  if (/(recruit|career|careers|job|jobs|saiyo|saiyou|hiring|employ)/.test(p))
    return 'recruit';
  // 導入事例・実績（顧客の事実源）
  if (/(case|cases|jirei|works|customer|clients?|example|showcase|voice)/.test(p))
    return 'case';
  if (/(company|about|corporate|profile|kaisya|gaiyo|outline)/.test(p))
    return 'about';
  if (/(service|product|solution|business)/.test(p)) return 'service';
  if (/(news|press|topics|release|ir|information)/.test(p)) return 'news';
  return null;
}

// よく使われる会社概要・採用・事例等のパスを直接プローブする候補
const PROBE_PATHS = [
  '/company',
  '/about',
  '/corporate',
  '/company/profile',
  '/service',
  '/services',
  '/products',
  '/recruit',
  '/recruit/',
  '/careers',
  '/saiyo',
  '/case',
  '/cases',
  '/works',
  '/jirei',
  '/case-study',
  '/customers',
  '/news',
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 同一ドメインを 1req/1s で丁寧に巡回する Collector。
// トップページは必須（取得不可なら中断）。他は取得できたものだけ使う。
export async function collectSite(
  start: URL,
  opts: CollectOptions = { maxPages: DEFAULT_MAX_PAGES, maxPageChars: DEFAULT_PAGE_CHARS },
): Promise<CollectResult> {
  const origin = start.origin;

  // robots.txt を先に取得（取得できなければ制限なしとして扱う）
  let robots: RobotsRules = { disallow: [] };
  try {
    const r = await fetchRaw(`${origin}/robots.txt`, 5_000);
    if (r.status >= 200 && r.status < 300) robots = parseRobots(r.html);
  } catch {
    // robots.txt が無い/取れないのは通常運転
  }

  // トップページのパスが robots で禁止されていたら中断（クレジット消費なし）
  if (!isAllowed(robots, start.pathname || '/')) {
    throw new AppError('ROBOTS_BLOCKED', start.pathname);
  }

  const pages: CollectedPage[] = [];
  const visited = new Set<string>();
  let lastRequestAt = 0;

  // レート制限を守って1ページ取得するヘルパー
  async function fetchPolite(target: URL): Promise<string | null> {
    const wait = MIN_INTERVAL_MS - (Date.now() - lastRequestAt);
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    try {
      const res = await fetchRaw(target.toString());
      if (res.status < 200 || res.status >= 300) return null;
      return res.html;
    } catch {
      return null;
    }
  }

  // 1) トップページ（必須）
  const topHtml = await fetchPolite(start);
  if (topHtml === null) {
    throw new AppError('FETCH_FAILED', start.toString());
  }
  visited.add(start.toString());
  pages.push({ url: start.toString(), text: htmlToText(topHtml, opts.maxPageChars), kind: 'top' });
  const siteTitle = extractTitle(topHtml);

  // 2) 収集候補を集める：トップのリンク（種別が判るもの）＋固定プローブ
  const candidates: URL[] = [];
  const seenCandidate = new Set<string>([start.toString()]);

  const pushCandidate = (u: URL) => {
    u.hash = '';
    const key = u.toString();
    if (seenCandidate.has(key)) return;
    if (u.host !== start.host) return;
    seenCandidate.add(key);
    candidates.push(u);
  };

  for (const link of extractLinks(topHtml, start.toString())) {
    try {
      const u = new URL(link);
      if (kindForPath(u.pathname)) pushCandidate(u);
    } catch {
      /* skip */
    }
  }
  for (const path of PROBE_PATHS) {
    pushCandidate(new URL(path, origin));
  }

  // 3) 上限まで取得する（トップを含めて opts.maxPages）
  for (const target of candidates) {
    if (pages.length >= opts.maxPages) break;
    if (visited.has(target.toString())) continue;
    if (!isAllowed(robots, target.pathname)) continue; // robots 禁止はスキップ
    visited.add(target.toString());

    const html = await fetchPolite(target);
    if (html === null) continue;
    const text = htmlToText(html, opts.maxPageChars);
    if (text.length < 40) continue; // 中身がほぼ無いページは捨てる
    pages.push({
      url: target.toString(),
      text,
      kind: kindForPath(target.pathname) ?? 'other',
    });
  }

  return {
    pages,
    sourceUrls: pages.map((p) => p.url),
    siteTitle,
  };
}
