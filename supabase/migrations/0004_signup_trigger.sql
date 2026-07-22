-- ============================================================
-- 0004 サインアップ時の初期化（docs/06）
--   Supabase Auth でユーザーが作られたら:
--   1. profiles 行を作る（credit_ledger 等の FK 前提。無いと課金/マージが失敗する）
--   2. 初回ボーナスとして 3 クレジットを付与（有料版の価値を体験させる）
--   トリガーは INSERT で1回だけ発火するので、ボーナスは1人1回になる。
-- ============================================================

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, email)
    values (new.id, new.email)
    on conflict (id) do nothing;

  -- 初回ボーナス（reason='bonus'）。有効期限は購入分と同じ6ヶ月（docs/07）
  insert into credit_ledger (user_id, amount, reason, expires_at)
    values (new.id, 3, 'bonus', now() + interval '6 months');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
