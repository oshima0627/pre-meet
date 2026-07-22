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

## 7. デプロイ（Cloudflare Workers / OpenNext）

本アプリは `@opennextjs/cloudflare` で **Cloudflare Workers**（`nodejs_compat`）に載せる。
API route の `runtime='nodejs'` のまま動く（Edge 書き換え不要）。`opennextjs-cloudflare build`
の成功は確認済み。

### 手順

```bash
cd apps/web
npx wrangler login                          # Cloudflare 認証

# レート制限用の共有KVを作成し、出力された id を wrangler.jsonc の
# kv_namespaces[].id（<REPLACE_WITH_KV_ID>）に貼る
npx wrangler kv namespace create RATE_LIMIT

# シークレットを登録（本番）。値は docs/09 の各サービスで取得したもの
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put NEXT_PUBLIC_SUPABASE_URL
npx wrangler secret put NEXT_PUBLIC_SUPABASE_ANON_KEY
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npx wrangler secret put NEXT_PUBLIC_APP_URL
npx wrangler secret put SEARCH_API_KEY       # 任意

npm run cf:deploy                            # build → deploy
# ローカルで Workers 実行を確認: npm run cf:preview
```

- `wrangler.jsonc` … Worker 名・`nodejs_compat`・KV バインディング（`RATE_LIMIT`）
- `open-next.config.ts` … OpenNext 既定構成
- `lib/cf.ts` … 実行時に `env.RATE_LIMIT` を取り出し `getKv()` へ渡す（本番で共有KVが効く）

### 生成の非同期化（本番前に推奨）

Worker には実行時間の上限がある。最大90秒のインライン生成は超過しうるので、
docs/02 通り **Queues** で非同期化するのが安全:
`/api/research` はジョブ投入だけ → 消費 Worker が生成 → クライアントは `/api/status` を
ポーリング。まず動作確認はインラインでも可。

### 代替: Vercel

Node ランタイムのままそのまま動く（最短）。その場合レート制限KVは Upstash Redis 等で
`KvStore`（get/put）を実装して `getKv()` に差し替える。

## 8. リリース前チェック（docs/07）

- [ ] 特商法ページの事業者情報を記入（現状プレースホルダ）
- [ ] 利用規約・プライバシーの最終確認
- [ ] robots 尊重の実挙動確認、`/bot` ページ
- [ ] Phase 0 の精度採点（`npm run verify:batch` を実キーで10社）
- [ ] 問い合わせ窓口（削除要請の受付）
