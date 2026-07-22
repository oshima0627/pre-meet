# 09. セットアップ・デプロイ手順

Phase 1 の実装済みコードを、実サービスに接続して動かすための手順。
コード側は完成しているので、以下は主に「アカウント作成・キー取得・環境変数設定」。

## 全体像

```
ブラウザ ─▶ Next.js（apps/web：画面＋API route＝BFF）
                 ├─ Supabase（DB/Auth）      ← マイグレーション適用が必要
                 ├─ Anthropic（生成）        ← APIキー
                 ├─ Stripe（決済）           ← キー＋Webhook登録
                 └─ Brave Search（任意/ニュース）
```

---

## 1. Supabase

1. [supabase.com](https://supabase.com) でプロジェクト作成
2. マイグレーション適用（`supabase/migrations/0001〜0004` を順に）
   - CLI: `supabase link --project-ref <ref>` → `supabase db push`
   - or SQL Editor に 0001→0002→0003→0004 を貼って実行
3. Auth プロバイダ設定（Authentication → Providers）
   - **Email（Magic Link）** を有効化
   - **Google** を有効化（Google Cloud で OAuth クライアントを作成し、
     Authorized redirect URI に `https://<project>.supabase.co/auth/v1/callback` を登録）
   - Site URL / Redirect URLs に本番URL と `http://localhost:3000` を追加
4. キーを控える（Project Settings → API）
   - `NEXT_PUBLIC_SUPABASE_URL` = Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = anon public
   - `SUPABASE_URL` = 同上、`SUPABASE_SERVICE_ROLE_KEY` = service_role（**サーバー専用**）

> 0004 のトリガーで、サインアップ時に `profiles` 作成＋3クレジット付与が自動で走る。

## 2. Anthropic

- [console.anthropic.com](https://console.anthropic.com) で `ANTHROPIC_API_KEY` を発行（課金有効化）

## 3. Stripe

1. [dashboard.stripe.com](https://dashboard.stripe.com)（まずテストモード）で `STRIPE_SECRET_KEY`
2. Webhook を登録（Developers → Webhooks → Add endpoint）
   - URL: `https://<本番URL>/api/stripe/webhook`
   - イベント: `checkout.session.completed`, `charge.refunded`
   - 署名シークレット `whsec_...` を `STRIPE_WEBHOOK_SECRET` に
3. ローカル検証は Stripe CLI: `stripe listen --forward-to localhost:3000/api/stripe/webhook`

## 4. （任意）Brave Search

- 企業名入力・ニュース収集を使うなら [brave.com/search/api](https://brave.com/search/api/) で `SEARCH_API_KEY`

## 5. 環境変数

`apps/web/.env.example` を `apps/web/.env.local` にコピーして各値を記入。
（一覧はそのファイル参照）

## 6. ローカル起動

```bash
npm install
cd apps/web && npm run dev   # http://localhost:3000
```

動作確認の順序:
1. トップでURLを入れて無料生成 → `/r/<slug>` に結果
2. ログイン（マジックリンク） → 3クレジット付与を確認
3. 料金ページ → テストカード（4242 4242 4242 4242）で購入 → Webhook で残高反映
4. 完全版（paid）で生成 → クレジット消費

## 7. デプロイ

このアプリは API route を **Node ランタイム**（`runtime='nodejs'`）で書いている。

- **Vercel（最短）**: そのまま動く。プロジェクトを import し、環境変数を設定するだけ。
  ただしレート制限の共有KVが必要（後述）。
- **Cloudflare Pages（docs 指定）**: Edge 化が必要。`@cloudflare/next-on-pages` を導入し、
  API route を `export const runtime = 'edge'` に変更、`nodejs_compat` フラグ、
  KV バインディング（`RATE_LIMIT`）を設定する。Queue による非同期生成もここで検討。

### レート制限の共有ストレージ（本番で必須）

`apps/web/lib/kv.ts` は開発時はプロセス内メモリ（インスタンス間で共有されない）。本番では:
- Cloudflare: KV バインディングを `getKv(env.RATE_LIMIT)` に渡す
- Vercel 等: Upstash Redis 等で `KvStore`（get/put）を実装して差し替える

## 8. リリース前チェック（docs/07）

- [ ] 特商法ページの事業者情報を記入（現状プレースホルダ）
- [ ] 利用規約・プライバシーの最終確認
- [ ] robots 尊重の実挙動確認、`/bot` ページ
- [ ] Phase 0 の精度採点（`npm run verify:batch` を実キーで10社）
- [ ] 問い合わせ窓口（削除要請の受付）
