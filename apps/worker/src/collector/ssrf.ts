import { AppError } from '../lib/errors.js';

// ============================================================
// SSRF 対策（docs/07・安全なクロール）
//   ユーザーが入力したURLをサーバーが取得するため、内部/予約アドレスへの
//   到達を塞ぐ。特にクラウドのメタデータ(169.254.169.254)・localhost・
//   プライベート帯を拒否する。リダイレクトでの回避を防ぐため、取得側では
//   ホップごとに本関数で再検証する（fetch-page.ts）。
// ============================================================

// IPv4 文字列を 4 オクテットに分解する（不正なら null）。
function parseIPv4(host: string): [number, number, number, number] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const parts = m.slice(1).map((s) => Number(s));
  if (parts.some((n) => n < 0 || n > 255)) return null;
  return parts as [number, number, number, number];
}

// プライベート/ループバック/リンクローカル/予約 IPv4 か。
function isPrivateIPv4(a: number, b: number, _c: number, _d: number): boolean {
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10/8
  if (a === 127) return true; // ループバック
  if (a === 169 && b === 254) return true; // リンクローカル（メタデータ含む）
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 192 && b === 0 && _c === 0) return true; // 192.0.0/24
  if (a === 198 && (b === 18 || b === 19)) return true; // ベンチマーク 198.18/15
  if (a >= 224) return true; // マルチキャスト/予約/ブロードキャスト
  return false;
}

// プライベート/ループバック/リンクローカル IPv6 か（IPv4射影も判定）。
function isPrivateIPv6(host: string): boolean {
  let h = host.toLowerCase();
  // ブラケット表記 [::1] を剥がす
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1);
  if (h === '::1' || h === '::') return true; // ループバック/未指定
  // IPv4射影/互換（::ffff:127.0.0.1 等）は末尾の v4 を評価する
  const v4 = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(h);
  if (v4 && v4[1]) {
    const p = parseIPv4(v4[1]);
    if (p && isPrivateIPv4(...p)) return true;
  }
  // ULA(fc00::/7) と リンクローカル(fe80::/10)
  if (/^f[cd]/.test(h)) return true;
  if (/^fe[89ab]/.test(h)) return true;
  return false;
}

// ホスト名（IPリテラル or ドメイン名）が明らかに内部向けなら拒否する。
// ドメイン名の場合は DNS 解決前のリテラル判定のみ（解決は assertPublicUrl で）。
function isBlockedHostLiteral(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  if (!h) return true;
  // 明示的な内部ホスト名・名前解決に頼らない特殊名
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h.endsWith('.local') || h.endsWith('.internal')) return true;
  // メタデータの別名（GCP 等）
  if (h === 'metadata' || h === 'metadata.google.internal') return true;

  const v4 = parseIPv4(h);
  if (v4 && isPrivateIPv4(...v4)) return true;
  if (h.includes(':') && isPrivateIPv6(h)) return true;
  return false;
}

// http(s) 以外のスキーム・内部ホストを弾く。DNS が使える環境（Node）では
// 名前解決して解決先IPも検査する（DNSリバインディング/内部名の回避対策）。
// DNS が使えない環境（CF Workers 等）はリテラル判定のみ＝プラットフォーム側の
// 内部到達制限に委ねる。エラーは呼び出し側の意味に合わせて渡す（既定 INVALID_INPUT）。
export async function assertPublicUrl(
  url: URL,
  errorCode: 'INVALID_INPUT' | 'FETCH_FAILED' = 'INVALID_INPUT',
): Promise<void> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new AppError(errorCode, 'URLスキームが不正です');
  }
  if (isBlockedHostLiteral(url.hostname)) {
    throw new AppError(errorCode, '内部アドレスは取得できません');
  }

  // DNS 解決してから解決先IPを検査（内部名 → プライベートIP の回避を塞ぐ）。
  // 解決手段が無い実行環境では、ここはスキップする（例外にしない）。
  try {
    const dns = await import('node:dns/promises');
    const records = await dns.lookup(url.hostname, { all: true });
    for (const { address, family } of records) {
      const blocked =
        family === 4
          ? (() => {
              const p = parseIPv4(address);
              return p ? isPrivateIPv4(...p) : false;
            })()
          : isPrivateIPv6(address);
      if (blocked) {
        throw new AppError(errorCode, '内部アドレスへの解決を検出しました');
      }
    }
  } catch (err) {
    // AppError（＝内部アドレス検出）は伝播させる。それ以外（node:dns 不在・
    // 名前解決失敗）は握りつぶし、リテラル判定の結果を採用する。
    if (err instanceof AppError) throw err;
  }
}
