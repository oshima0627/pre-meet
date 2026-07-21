// robots.txt を必ず尊重する（docs/07・法務要件）。
// Disallow パスは取得しない。最小実装だが User-agent グループの選択と
// パス前方一致は正しく処理する。

export interface RobotsRules {
  // このドメインで取得を禁止されているパスの前方一致リスト
  disallow: string[];
}

// 自分たちの UA トークン。robots.txt の User-agent 指定に一致させる
export const BOT_UA_TOKEN = 'PreMeetBot';

// User-Agent は明示し、問い合わせ先URLを含める（docs/02, docs/07）
export const USER_AGENT = `${BOT_UA_TOKEN}/1.0 (+https://premeet.jp/bot)`;

// robots.txt をパースする。対象UAのグループが無ければ * のグループを使う。
export function parseRobots(body: string): RobotsRules {
  // User-agent ごとにルールをまとめる
  const groups = new Map<string, string[]>();
  let currentAgents: string[] = [];
  let sawRuleForCurrent = false;

  for (const rawLine of body.split('\n')) {
    // コメントと空白を除去
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === 'user-agent') {
      // 直前の連続する User-agent 行は同じグループにまとめる
      if (sawRuleForCurrent) {
        currentAgents = [];
        sawRuleForCurrent = false;
      }
      currentAgents.push(value.toLowerCase());
      if (!groups.has(value.toLowerCase())) groups.set(value.toLowerCase(), []);
    } else if (field === 'disallow') {
      sawRuleForCurrent = true;
      for (const agent of currentAgents) {
        groups.get(agent)?.push(value);
      }
    }
    // Allow/その他フィールドは最小実装では扱わない
  }

  const token = BOT_UA_TOKEN.toLowerCase();
  const matched =
    groups.get(token) ?? groups.get('*') ?? [];
  // 空文字の Disallow は「制限なし」を意味するので除外する
  const disallow = matched.filter((p) => p !== '');
  return { disallow };
}

// 指定パスが取得可能か。Disallow の前方一致に当たれば false。
export function isAllowed(rules: RobotsRules, pathname: string): boolean {
  return !rules.disallow.some((prefix) => pathname.startsWith(prefix));
}
