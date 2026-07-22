import { NextResponse } from 'next/server';
import { getStripe, PACKS, isPackId } from '@/lib/stripe';
import { getUserId } from '@/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Stripe Checkout セッション作成（docs/04）。mode は payment のみ（サブスク不可）。
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { pack?: string };
    if (!isPackId(body.pack)) {
      return NextResponse.json(
        { error: { code: 'INVALID_INPUT', message: 'pack が不正です' } },
        { status: 400 },
      );
    }
    // 決済にはアカウントが必要（docs/04：未ログインは先にログインへ）
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json(
        { error: { code: 'AUTH_REQUIRED', message: 'ログインが必要です' } },
        { status: 401 },
      );
    }

    const pack = PACKS[body.pack];
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      client_reference_id: userId,
      metadata: { userId, pack: body.pack, credits: String(pack.credits) },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'jpy',
            unit_amount: pack.amountJpy,
            product_data: { name: `PreMeet クレジット ${pack.label}（${pack.credits}回）` },
          },
        },
      ],
      success_url: `${appUrl}/pricing?status=success`,
      cancel_url: `${appUrl}/pricing?status=cancel`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : '不明なエラー';
    return NextResponse.json(
      { error: { code: 'STRIPE_ERROR', message } },
      { status: 500 },
    );
  }
}
