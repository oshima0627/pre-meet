-- ============================================================
-- 0005 Stripe Webhook を原子的・冪等にする（docs/04）
--   これまでのWebhookは「payments upsert → credit_ledger insert」を別々の
--   awaitで行い、二重付与防止を credit_ledger の部分ユニーク（payment_intent）
--   だけに頼っていた。payment_intent が null の決済や、途中失敗→Stripe再送で
--   二重付与/二重返金が起きうる。付与・返金をそれぞれ1トランザクションの
--   関数にまとめ、payments 行の一意性（stripe_session_id）で冪等化する。
-- ============================================================

-- 購入時のクレジット付与（原子的・冪等）。
-- 既に同一 session で付与済みなら false（何もしない）。新規なら payments と
-- credit_ledger を同一トランザクションで書き、途中失敗時は両方ロールバックする。
create or replace function grant_purchase_credits(
  p_user_id uuid,
  p_session_id text,
  p_payment_intent_id text,
  p_amount_jpy int,
  p_credits int,
  p_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  -- payments は stripe_session_id が unique。既処理なら衝突して skip される。
  insert into payments (
    user_id, stripe_session_id, stripe_payment_intent_id,
    amount_jpy, credits, status
  )
  values (
    p_user_id, p_session_id, p_payment_intent_id,
    p_amount_jpy, p_credits, 'paid'
  )
  on conflict (stripe_session_id) do nothing;

  -- 挿入されなかった＝この session は既に付与済み。二重付与しない。
  if not found then
    return false;
  end if;

  insert into credit_ledger (
    user_id, amount, reason, stripe_payment_intent_id, expires_at
  )
  values (
    p_user_id, p_credits, 'purchase', p_payment_intent_id, p_expires_at
  );

  return true;
end;
$$;

-- 返金の反映（原子的・冪等）。payments を paid→refunded に一度だけ遷移させ、
-- 遷移できた場合のみ台帳にマイナス計上する。Stripe再送では既に refunded の
-- ため 0 行更新となり、二重減算を防ぐ。
create or replace function apply_purchase_refund(
  p_payment_intent_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_credits int;
begin
  update payments
     set status = 'refunded'
   where stripe_payment_intent_id = p_payment_intent_id
     and status <> 'refunded'
  returning user_id, credits into v_user_id, v_credits;

  if not found then
    return false; -- 該当なし or 既に返金済み
  end if;

  -- 返金は台帳をマイナス計上（残高が負になることは許容。docs/04）。
  -- purchase 行と payment_intent が衝突しないよう、返金行には payment_intent を
  -- 付けない（冪等性は payments の状態遷移で担保している）。
  insert into credit_ledger (user_id, amount, reason)
  values (v_user_id, -v_credits, 'refund');

  return true;
end;
$$;
