// 検証スクリプト共通の小物。単一責務のヘルパーのみ置く。

// ドメインからファイル名用スラッグを作る
export function slugify(domain: string): string {
  return domain.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'report';
}

// USD 表示（原価は小さいので5桁まで）
export function fmtUsd(n: number): string {
  return `$${n.toFixed(5)}`;
}

// 固定幅で右詰め/左詰め（コンソール表の整形用）
export function pad(s: string | number, width: number, align: 'l' | 'r' = 'l'): string {
  const str = String(s);
  // 全角を2幅として概算し、見た目の桁を揃える
  const visual = [...str].reduce((w, ch) => w + (ch.charCodeAt(0) > 0xff ? 2 : 1), 0);
  const fill = ' '.repeat(Math.max(0, width - visual));
  return align === 'r' ? fill + str : str + fill;
}
