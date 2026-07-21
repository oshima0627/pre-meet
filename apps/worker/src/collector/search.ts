import { USER_AGENT } from './robots.js';
import type { WorkerConfig } from '../lib/env.js';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

// Web検索API（ニュース収集）。失敗時はスキップ（[] を返す）してよい（docs/02）。
// 既定は Brave Search。SEARCH_API_KEY 未設定なら検索は行わない。
export async function webSearch(
  query: string,
  config: WorkerConfig,
  limit = 5,
): Promise<SearchResult[]> {
  if (!config.searchApiKey) return [];

  try {
    if (config.searchProvider === 'brave') {
      return await braveSearch(query, config.searchApiKey, limit);
    }
    // 未対応プロバイダは黙ってスキップ（原価防衛より前に落とさない）
    return [];
  } catch {
    // ニュース収集は失敗しても中断しない（docs/02 のエラーハンドリング方針）
    return [];
  }
}

async function braveSearch(
  query: string,
  apiKey: string,
  limit: number,
): Promise<SearchResult[]> {
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', String(Math.min(limit, 10)));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
        'X-Subscription-Token': apiKey,
      },
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
    };
    const results = json.web?.results ?? [];
    return results
      .filter((r): r is { title: string; url: string; description?: string } =>
        Boolean(r.url && r.title),
      )
      .slice(0, limit)
      .map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.description ?? '',
      }));
  } finally {
    clearTimeout(timer);
  }
}
