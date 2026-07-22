# supabase/

PreMeet の DB スキーマ（docs/03）。Postgres + RLS 必須。

## マイグレーション

| ファイル | 内容 |
|---|---|
| `migrations/0001_initial_schema.sql` | テーブル・インデックス・残高ビュー |
| `migrations/0002_functions.sql` | RPC（`consume_credit` / `refund_credit` / `merge_anon_to_user`） |
| `migrations/0003_rls.sql` | RLS 有効化・ポリシー |

## 適用方法

Supabase CLI（推奨）:

```bash
supabase db reset           # ローカル: 全マイグレーションを再適用
# or 本番へ
supabase db push
```

CLI を使わない場合は、SQL エディタで `0001 → 0002 → 0003` の順に実行する。

## 設計上の要点（docs/03・CLAUDE.md）

- **個人情報を持たない**。氏名・所属・名刺情報のカラムは作らない
- **クレジットは台帳(ledger)方式**。残高はカラムで持たず `sum(amount)`。
  `credit_balances` ビューは `security_invoker=true` で RLS を継承し、他人の残高が漏れない
- **消費・返還は必ず RPC 経由**（`consume_credit` / `refund_credit`）。
  残高チェックと消費を分けると二重消費が起きる
- **失敗時は必ず返還**（`refund_credit`）。同一レポートへの二重返還は冪等に防ぐ
- **書き込みは service_role / RPC のみ**。`SUPABASE_SERVICE_ROLE_KEY` はサーバー側だけで使い、
  クライアントに絶対に出さない（RLS をバイパスするため）
- `anon_visitors` / `events` は匿名でも書き込みが必要だが、クライアントの anon key で
  直接叩かせず BFF/Worker（service_role）に集約する
