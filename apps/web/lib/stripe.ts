import Stripe from 'stripe';

// クレジットパック（docs/06）。サブスクは実装しない（買い切りのみ）。
export type PackId = 'starter' | 'standard' | 'pro';

export const PACKS: Record<
  PackId,
  { amountJpy: number; credits: number; label: string }
> = {
  starter: { amountJpy: 980, credits: 10, label: 'スターター' },
  standard: { amountJpy: 2980, credits: 40, label: 'スタンダード' },
  pro: { amountJpy: 7980, credits: 150, label: 'プロ' },
};

export function isPackId(v: unknown): v is PackId {
  return v === 'starter' || v === 'standard' || v === 'pro';
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY が未設定です');
  // Cloudflare Workers では Node 既定の HTTP クライアントが使えず接続に失敗するため、
  // fetch ベースのクライアントを明示指定する（"connection to Stripe" エラーの回避）。
  return new Stripe(key, {
    httpClient: Stripe.createFetchHttpClient(),
  });
}

// クレジット有効期限は6ヶ月（docs/07：資金決済法の適用対象外に収めるため）
export function creditExpiryIso(from = new Date()): string {
  const d = new Date(from);
  d.setMonth(d.getMonth() + 6);
  return d.toISOString();
}
