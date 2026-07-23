import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { getStripe, creditExpiryIso } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 必ず署名検証する（docs/04）。検証なしで残高を増やすとリクエスト偽造で無限クレジットになる。
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = req.headers.get('stripe-signature');
  if (!secret || !sig) {
    return NextResponse.json({ error: 'signature missing' }, { status: 400 });
  }

  // 署名検証には生ボディが必要。text() だと Workers/OpenNext の復号でマルチバイト
  // （日本語を含む charge.refunded 等）がズレて署名不一致になるため、生バイトを
  // そのまま渡し、UTF-8 デコードは Stripe SDK 側に任せる（byte-faithful 検証）。
  const raw = Buffer.from(await req.arrayBuffer());
  let event: Stripe.Event;
  try {
    // Cloudflare Workers では同期版の署名検証（Node crypto 依存）が使えないため、
    // SubtleCrypto を使う非同期版 constructEventAsync で検証する。
    event = await getStripe().webhooks.constructEventAsync(
      raw,
      sig,
      secret,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'invalid';
    return NextResponse.json({ error: `signature: ${message}` }, { status: 400 });
  }

  // サービスロールで DB を書く（Webhook はサーバー間通信）
  const db = createClient(
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    { auth: { persistSession: false } },
  );

  try {
    if (event.type === 'checkout.session.completed') {
      const s = event.data.object;
      const userId = s.client_reference_id;
      const credits = Number(s.metadata?.credits ?? 0);
      const paymentIntentId =
        typeof s.payment_intent === 'string' ? s.payment_intent : null;
      if (userId && credits > 0) {
        // 付与は原子的・冪等な RPC に委ねる（payments/credit_ledger を1トランザクション）。
        // 二重付与防止は payments.stripe_session_id の一意性で担保する（0005）。
        const { error } = await db.rpc('grant_purchase_credits', {
          p_user_id: userId,
          p_session_id: s.id,
          p_payment_intent_id: paymentIntentId,
          p_amount_jpy: s.amount_total ?? 0,
          p_credits: credits,
          p_expires_at: creditExpiryIso(),
        });
        if (error) throw new Error(error.message);
      }
    } else if (event.type === 'charge.refunded') {
      const charge = event.data.object;
      const paymentIntentId =
        typeof charge.payment_intent === 'string' ? charge.payment_intent : null;
      if (paymentIntentId) {
        // 返金も原子的・冪等な RPC で反映（再送しても二重減算しない。0005）
        const { error } = await db.rpc('apply_purchase_refund', {
          p_payment_intent_id: paymentIntentId,
        });
        if (error) throw new Error(error.message);
      }
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    // DB 書き込み失敗は 500 で返し Stripe に再送させる（RPC が冪等なので安全）。
    // 生のエラー文言は外へ出さず運用ログにのみ残す（情報漏洩を避ける）。
    console.error('[stripe/webhook] 処理失敗:', err);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
