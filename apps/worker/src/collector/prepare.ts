import type { CollectedPage } from '@premeet/shared';

// Stage1 へ渡す前に本文を圧縮する。原価の主因は Stage1 の入力トークンなので、
// (1) 複数ページ共通の定型文（ナビ/フッター）を除去し、(2) 総量に上限をかける。
// いずれも「事実」を落とさずトークンだけ削るための処理。

// 収集種別の優先度（小さいほど残す。総量超過時は大きい方から削る）。
// 採用・事例・会社概要は仮説構築（求人逆算・顧客理解）に効くので優先的に残す。
const KIND_PRIORITY: Record<CollectedPage['kind'], number> = {
  top: 0,
  about: 1,
  recruit: 2, // 求人からの課題逆算＝価値の中核なので優先
  case: 3, // 導入事例＝顧客の事実源
  service: 4,
  news: 5,
  other: 6,
};

// 複数ページに共通で現れる行（＝ナビ/フッター等の定型文）を落とす。
// ページ数が少ないと誤除去しやすいので 4ページ以上のときだけ適用する。
function stripBoilerplate(pages: CollectedPage[]): CollectedPage[] {
  if (pages.length < 4) return pages;

  // 行ごとの出現ページ数を数える（同一ページ内の重複は1回として数える）
  const pageCount = new Map<string, number>();
  for (const p of pages) {
    const seen = new Set<string>();
    for (const line of p.text.split('\n')) {
      const key = line.trim();
      if (key.length < 8) continue; // 短い行は誤除去を避けて対象外
      if (seen.has(key)) continue;
      seen.add(key);
      pageCount.set(key, (pageCount.get(key) ?? 0) + 1);
    }
  }

  // 6割以上のページに出る行は定型文とみなして除去
  const threshold = Math.ceil(pages.length * 0.6);
  return pages.map((p) => {
    const kept = p.text
      .split('\n')
      .filter((line) => (pageCount.get(line.trim()) ?? 0) < threshold);
    return { ...p, text: kept.join('\n') };
  });
}

// 総量が maxTotalChars を超えないよう、優先度の低い種別から削る。
function enforceBudget(
  pages: CollectedPage[],
  maxTotalChars: number,
): CollectedPage[] {
  const ordered = [...pages].sort(
    (a, b) => KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind],
  );
  const out: CollectedPage[] = [];
  let used = 0;
  for (const p of ordered) {
    if (used >= maxTotalChars) break;
    const remain = maxTotalChars - used;
    const text = p.text.length > remain ? p.text.slice(0, remain) : p.text;
    if (text.trim().length < 40) continue; // 実質空なら入れない
    out.push({ ...p, text });
    used += text.length;
  }
  return out;
}

export interface PreparedPages {
  pages: CollectedPage[];
  totalChars: number;
}

export function prepareForStage1(
  pages: CollectedPage[],
  maxTotalChars: number,
): PreparedPages {
  const compact = enforceBudget(stripBoilerplate(pages), maxTotalChars);
  return {
    pages: compact,
    totalChars: compact.reduce((sum, p) => sum + p.text.length, 0),
  };
}
