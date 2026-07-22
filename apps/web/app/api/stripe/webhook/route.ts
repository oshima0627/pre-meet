import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
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

  const raw = await req.text(); // 署名検証には生ボディが必要
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(raw, sig, secret);
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
        // 決済履歴を paid に
        await db.from('payments').upsert(
          {
            user_id: userId,
            stripe_session_id: s.id,
            stripe_payment_intent_id: paymentIntentId,
            amount_jpy: s.amount_total ?? 0,
            credits,
            status: 'paid',
          },
          { onConflict: 'stripe_session_id' },
        );
        // クレジット付与。stripe_payment_intent_id のユニーク制約で二重付与を防ぐ（docs/04）
        await db.from('credit_ledger').insert({
          user_id: userId,
          amount: credits,
          reason: 'purchase',
          stripe_payment_intent_id: paymentIntentId,
          expires_at: creditExpiryIso(),
        });
      }
    } else if (event.type === 'charge.refunded') {
      const charge = event.data.object;
      const paymentIntentId =
        typeof charge.payment_intent === 'string' ? charge.payment_intent : null;
      // 付与時のレコードから user_id / credits を引く
      if (paymentIntentId) {
        const { data: pay } = await db
          .from('payments')
          .select('user_id, credits')
          .eq('stripe_payment_intent_id', paymentIntentId)
          .maybeSingle();
        if (pay?.user_id) {
          // 返金＝クレジットをマイナス計上（残高が負になることは許容。docs/04）
          await db.from('credit_ledger').insert({
            user_id: pay.user_id,
            amount: -Number(pay.credits ?? 0),
            reason: 'refund',
          });
          await db
            .from('payments')
            .update({ status: 'refunded' })
            .eq('stripe_payment_intent_id', paymentIntentId);
        }
      }
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    // DB 書き込み失敗は 500 で返し Stripe に再送させる（冪等なので安全）
    const message = err instanceof Error ? err.message : 'db error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
