-- ============================================================
-- 0002 RPC 関数（docs/03）
--   クレジット消費・返還・匿名マージを1トランザクションで原子的に処理する。
--   残高チェックと消費を分けると二重消費が起きるため、必ず RPC 経由にする。
-- ============================================================

-- クレジット消費（原子的）。残高不足なら false を返し、消費しない。
create or replace function consume_credit(
  p_user_id uuid,
  p_report_id uuid,
  p_amount int default 1
)
returns boolean
language plpgsql
security definer
as $$
declare
  v_balance int;
begin
  -- 行ロックを取って残高を再計算（同時消費の競合を防ぐ）
  perform 1 from profiles where id = p_user_id for update;

  select coalesce(sum(amount), 0) into v_balance
  from credit_ledger
  where user_id = p_user_id
    and (expires_at is null or expires_at > now());

  if v_balance < p_amount then
    return false;
  end if;

  insert into credit_ledger (user_id, amount, reason, report_id)
  values (p_user_id, -p_amount, 'consume', p_report_id);

  return true;
end;
$$;

-- クレジット返還（原子的）。生成失敗時は必ずこれを呼ぶ（docs/02 エラー方針）。
-- 「価値ある結果を返せなかった場合、クレジットは必ず返す」＝返金対応という
-- 実作業を発生させないための仕組み。二重返還は report ごとに冪等チェックする。
create or replace function refund_credit(
  p_user_id uuid,
  p_report_id uuid,
  p_amount int default 1
)
returns boolean
language plpgsql
security definer
as $$
declare
  v_already int;
begin
  perform 1 from profiles where id = p_user_id for update;

  -- 同一レポートに対する返還が既にあれば二重返還しない（冪等）
  select count(*) into v_already
  from credit_ledger
  where report_id = p_report_id and reason = 'refund';

  if v_already > 0 then
    return false;
  end if;

  insert into credit_ledger (user_id, amount, reason, report_id)
  values (p_user_id, p_amount, 'refund', p_report_id);

  return true;
end;
$$;

-- 匿名 → ログイン時のマージ（docs/03）。
-- 「無料で作った結果を残したいからログインする」導線になり転換率に直結する。
create or replace function merge_anon_to_user(
  p_anon_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
as $$
begin
  update research_reports
     set user_id = p_user_id
   where anon_id = p_anon_id
     and user_id is null;

  update anon_visitors
     set merged_to_user_id = p_user_id
   where id = p_anon_id;
end;
$$;
