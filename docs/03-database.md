# 03. データベース設計（Supabase / PostgreSQL）

## 設計方針

- **匿名利用を前提にする。** `user_id` は nullable。匿名は `anon_key`（Cookie由来のUUID）で紐づけ、後からログイン時にマージする
- **個人情報を持たない。** 氏名・所属・名刺情報は一切カラムを作らない
- クレジットは残高カラムではなく **台帳（ledger）方式**。増減の履歴が追えないと返金対応が破綻する

---

## テーブル定義

```sql
-- =========================================
-- ユーザー（Supabase Auth の users を拡張）
-- =========================================
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  -- 自社サービス情報（US-07：切り口生成の精度を上げる）
  own_company_name text,
  own_service_summary text,          -- 自社が何を売っているか
  own_target_customer text,          -- 想定顧客像
  created_at timestamptz not null default now()
);

-- =========================================
-- 匿名利用者（ログイン前）
-- Cookie に保存した UUID で識別する
-- =========================================
create table anon_visitors (
  id uuid primary key,                        -- クライアント発行UUID
  merged_to_user_id uuid references profiles(id),  -- ログイン時に紐付け
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- =========================================
-- 企業（ドメイン単位でキャッシュする）
-- =========================================
create table companies (
  id uuid primary key default gen_random_uuid(),
  domain text not null unique,               -- 例: example.co.jp（正規化済み）
  name text,
  -- 収集した生テキストの要約結果（Stage1の出力）
  facts jsonb,
  facts_generated_at timestamptz,
  -- 収集元URLの一覧（透明性のため結果画面に出す）
  source_urls text[],
  crawl_blocked boolean not null default false,  -- robots.txt で禁止された
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on companies (domain);
create index on companies (facts_generated_at);

-- =========================================
-- リサーチレポート（生成物）
-- =========================================
create table research_reports (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,                 -- 共有URL用の短い識別子
  company_id uuid not null references companies(id) on delete cascade,

  user_id uuid references profiles(id) on delete set null,
  anon_id uuid references anon_visitors(id) on delete set null,

  tier text not null default 'free',         -- free / paid
  status text not null default 'queued',     -- queued/collecting/generating/done/failed
  error_code text,                           -- ROBOTS_BLOCKED / FETCH_FAILED / THIN_CONTENT / AI_FAILED

  -- 生成結果
  facts jsonb,                               -- セクション1〜4
  hypothesis jsonb,                          -- セクション5〜8（paidのみ）

  -- 自社情報のスナップショット（生成時点の値を保持）
  own_context jsonb,

  -- 計測用
  model_stage1 text,
  model_stage2 text,
  input_tokens int,
  output_tokens int,
  cost_usd numeric(10,5),
  duration_ms int,

  is_public boolean not null default false,  -- 共有リンクを有効化したか
  created_at timestamptz not null default now(),
  completed_at timestamptz,

  -- 匿名かログインユーザーのどちらかは必ず存在する
  constraint owner_required check (user_id is not null or anon_id is not null)
);

create index on research_reports (user_id, created_at desc);
create index on research_reports (anon_id, created_at desc);
create index on research_reports (slug);
create index on research_reports (status);

-- =========================================
-- クレジット台帳
-- 残高 = sum(amount)。カラムで持たない
-- =========================================
create table credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  amount int not null,                       -- 購入は正、消費は負
  reason text not null,                      -- purchase/consume/refund/bonus
  report_id uuid references research_reports(id) on delete set null,
  stripe_payment_intent_id text,
  expires_at timestamptz,                    -- 購入分のみ設定（docs/07 参照）
  created_at timestamptz not null default now()
);

create index on credit_ledger (user_id, created_at desc);
-- 同一決済の二重付与を防ぐ
create unique index on credit_ledger (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

-- 残高取得用ビュー（有効期限切れを除外）
create view credit_balances as
select
  user_id,
  sum(amount) as balance
from credit_ledger
where expires_at is null or expires_at > now()
group by user_id;

-- =========================================
-- Stripe 決済履歴
-- =========================================
create table payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  stripe_session_id text not null unique,
  stripe_payment_intent_id text,
  amount_jpy int not null,
  credits int not null,
  status text not null default 'pending',    -- pending/paid/failed/refunded
  created_at timestamptz not null default now()
);

-- =========================================
-- 生成イベントログ（KPI計測用）
-- =========================================
create table events (
  id bigserial primary key,
  name text not null,          -- view_lp / submit_url / view_report / click_unlock / purchase
  anon_id uuid,
  user_id uuid,
  props jsonb,
  created_at timestamptz not null default now()
);

create index on events (name, created_at desc);
```

---

## クレジット消費（原子的に処理する）

残高チェックと消費を分けると二重消費が起きる。**必ずRPCで1トランザクションにする。**

```sql
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
  -- 行ロックを取って残高を再計算
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
```

返還も同様にRPC化する（`refund_credit`）。
**生成失敗時は必ず返還を呼ぶこと。** docs/02 のエラーハンドリング方針を参照。

---

## RLS ポリシー

```sql
alter table profiles          enable row level security;
alter table research_reports  enable row level security;
alter table credit_ledger     enable row level security;
alter table payments          enable row level security;

-- 自分のプロフィールのみ
create policy "own profile" on profiles
  for all using (auth.uid() = id);

-- レポート：自分のもの、または公開されているもの
create policy "read own or public report" on research_reports
  for select using (
    auth.uid() = user_id or is_public = true
  );

-- クレジット台帳は閲覧のみ。書き込みは service_role / RPC 経由のみ
create policy "read own ledger" on credit_ledger
  for select using (auth.uid() = user_id);

create policy "read own payments" on payments
  for select using (auth.uid() = user_id);
```

> `companies` は公開情報のキャッシュなので RLS 不要（読み取り公開・書き込みは service_role のみ）。
> ただし anon key での書き込みは必ず塞ぐこと。

---

## 匿名 → ログイン時のマージ

```sql
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
```

「無料で作った結果を残したいからログインする」という導線になるため、
**マージ機能は転換率に直結する。MVPから入れること。**
