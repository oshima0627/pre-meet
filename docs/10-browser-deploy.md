# 10. ブラウザだけでデプロイする手順（CLI を使わない）

`docs/09` は CLI（wrangler）前提。本書は **すべてダッシュボード（ブラウザ）** で
完結させる版。Cloudflare は **Workers Builds**（GitHubリポジトリを接続して自動ビルド）
を使う。

> 前提：コードは実装済み。やることは「アカウント作成・キー取得・値の貼り付け」だけ。
> 所要 60〜90分。**順番が重要**（URL が後から決まるため、最後に再デプロイする）。

---

## 環境変数の一覧（どこに入れるか）

| 変数 | 種別 | どこで取得 | 備考 |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | 秘密（実行時） | Anthropic | 生成に必須 |
| `SUPABASE_URL` | 秘密（実行時） | Supabase | サーバー用 |
| `SUPABASE_SERVICE_ROLE_KEY` | 秘密（実行時） | Supabase | **絶対にクライアントへ出さない** |
| `STRIPE_SECRET_KEY` | 秘密（実行時） | Stripe | `sk_test_...` から |
| `STRIPE_WEBHOOK_SECRET` | 秘密（実行時） | Stripe | `whsec_...`。デプロイ後に確定 |
| `NEXT_PUBLIC_SUPABASE_URL` | 公開（ビルド時） | Supabase | 画面用。ビルドに焼き込まれる |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 公開（ビルド時） | Supabase | 画面用 |
| `NEXT_PUBLIC_APP_URL` | 公開（ビルド時） | Cloudflare | **デプロイ後に確定**する自分のURL |
| `SEARCH_API_KEY` | 任意（実行時） | Brave | ニュース/企業名検索を使うなら |

> **重要な区別：** `NEXT_PUBLIC_*` は「ビルド時」に画面へ焼き込まれる。
> Workers Builds の **Build variables** 側に入れる必要がある。
> それ以外の秘密は「実行時」に Worker が読むので **Variables and Secrets** 側に入れる。
> （両方に入れておいても害はないが、`SERVICE_ROLE` など秘密は Build 側に置かない方が安全）

---

## 1. Supabase（DB・認証）

1. [supabase.com](https://supabase.com) → **New project**。リージョンは Tokyo 推奨。
   DB パスワードは控える。
2. 左メニュー **SQL Editor** → **New query**。`supabase/migrations` の中身を
   **4回に分けて** 貼り付け→ **Run**。順番厳守：
   - `0001_initial_schema.sql`
   - `0002_functions.sql`
   - `0003_rls.sql`
   - `0004_signup_trigger.sql`
   （1本ずつ実行し、エラーが出たら次に進まない）
3. **Authentication → Providers**
   - **Email** を有効化（Magic Link）。
   - **Google** を有効化 → 手順は「§1.5 Google OAuth」参照。
4. **Authentication → URL Configuration**
   - **Site URL** … いまは `http://localhost:3000` で仮置き（後で本番URLに更新）
   - **Redirect URLs** … `http://localhost:3000/auth/callback` を追加
     （本番URLは §6 で追加）
5. **Project Settings → API** で以下を控える：
   - **Project URL** → `SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_URL`（同じ値）
   - **anon public** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** → `SUPABASE_SERVICE_ROLE_KEY`（サーバー専用・厳重管理）

> `0004` のトリガーで、サインアップ時に `profiles` 作成＋**3クレジット付与**が自動で走る。

### 1.5 Google OAuth（任意だが推奨）

1. [console.cloud.google.com](https://console.cloud.google.com) → プロジェクト作成
2. **APIとサービス → OAuth同意画面** を設定（外部・アプリ名・メール）
3. **認証情報 → 認証情報を作成 → OAuthクライアントID → ウェブアプリケーション**
4. **承認済みのリダイレクトURI** に Supabase のコールバックを登録：
   `https://<project-ref>.supabase.co/auth/v1/callback`
5. 発行された **クライアントID / シークレット** を Supabase の Google プロバイダ設定に貼る

---

## 2. Anthropic（生成）

1. [console.anthropic.com](https://console.anthropic.com) → **Billing** で課金を有効化
2. **API Keys → Create Key** → 値を `ANTHROPIC_API_KEY` として控える
   - ⚠️ このキーは **`.env` やコードに絶対コミットしない**。控えるのは手元のメモだけ。

---

## 3. Stripe（決済）※まずテストモード

1. [dashboard.stripe.com](https://dashboard.stripe.com) 右上を **Test mode** に
2. **Developers → API keys** の **Secret key**（`sk_test_...`）→ `STRIPE_SECRET_KEY`
3. Webhook は **デプロイ後**（§5）に URL が決まってから登録する。
   （`STRIPE_WEBHOOK_SECRET` はその時に確定）

> 価格・クレジット数はコード側（`apps/web/lib/stripe.ts` の PACKS）で定義済み。
> Stripe 側に商品を作る必要はない（`mode: "payment"` の都度課金）。

---

## 4. Cloudflare 準備（KV の作成）

1. [dash.cloudflare.com](https://dash.cloudflare.com) にログイン
2. **Storage & Databases → KV → Create a namespace**
   - 名前：`premeet-rate-limit`（任意）
3. 作成後に表示される **Namespace ID**（英数字の長い文字列）を控える。
   → これを `apps/web/wrangler.jsonc` の `<REPLACE_WITH_KV_ID>` に入れる必要がある。
   **この値を教えてくれれば私が commit する**（Workers Builds は Git から読むため、
   ファイルに実IDが入っていないと本番でレート制限KVが繋がらない）。

---

## 5. Cloudflare Workers Builds（GitHub 接続で自動デプロイ）

1. **Workers & Pages → Create → Workers → Import a repository**（Git 接続）
   - GitHub を認可し、`oshima0627/pre-meet` を選択
2. **ビルド設定**（モノレポなので下記が肝）：
   - **Root directory**: `apps/web`
   - **Build command**: `npm run cf:build`
   - **Deploy command**: `npx wrangler deploy`
   - （`cf:build` = `opennextjs-cloudflare build`。`.open-next/worker.js` を生成する）
3. **Build variables and secrets**（＝ビルド時。`NEXT_PUBLIC_*` はここが必須）：
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_APP_URL` … いまは仮で `https://premeet.<subdomain>.workers.dev`
     （正確な値は初回デプロイ後に判明。§6 で修正して再デプロイ）
4. **Save and Deploy**。初回ビルドが走る（数分）。
   - 失敗したらログを確認。よくある原因はモノレポの依存解決（下の「詰まったら」参照）。
5. デプロイ成功で **`https://premeet.<subdomain>.workers.dev`** が発行される。この URL を控える。

### 実行時の秘密を登録

**Workers & Pages → premeet → Settings → Variables and Secrets** で
以下を **Secret** として追加（Encrypt）：

- `ANTHROPIC_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`（§5.5 で確定してから）
- `NEXT_PUBLIC_APP_URL`（本番URL。実行時にも参照するため両方に入れる）
- `SEARCH_API_KEY`（任意）

追加したら **Deploy**（再デプロイで反映）。

### 5.5 Stripe Webhook を登録（URL 確定後）

1. Stripe **Developers → Webhooks → Add endpoint**
   - **Endpoint URL**: `https://premeet.<subdomain>.workers.dev/api/stripe/webhook`
   - **イベント**: `checkout.session.completed`, `charge.refunded`
2. 発行された **Signing secret**（`whsec_...`）を Cloudflare の
   `STRIPE_WEBHOOK_SECRET`（Secret）に登録 → 再デプロイ

---

## 6. デプロイ後の URL 配線（ここで整合させる）

初回デプロイで自分の URL が確定したので、仮置きを本物に直す：

1. **Cloudflare Build variables**：`NEXT_PUBLIC_APP_URL` を本番URLに更新
2. **Supabase → Authentication → URL Configuration**
   - **Site URL** を本番URLに
   - **Redirect URLs** に `https://premeet.<subdomain>.workers.dev/auth/callback` を追加
3. **Stripe Webhook** の URL が本番URLになっているか確認（§5.5）
4. Cloudflare で **再デプロイ**（`NEXT_PUBLIC_APP_URL` はビルド時に焼き込むため必須）

---

## 7. 動作確認（本番URLで）

1. トップで会社URLを入力 → 無料生成 → `/r/<slug>` に結果（事実 1〜4 が出る）
2. ログイン（マジックリンク or Google）→ ログイン後に **3クレジット** 付与を確認
3. 料金ページ → テストカード `4242 4242 4242 4242`（有効期限は未来・CVC任意）で購入
   → Stripe Webhook 経由で残高が増える
4. 完全版（paid）で生成 → クレジットが 1 消費される
5. 失敗時（存在しないドメイン等）→ クレジットが返る（返金台帳）

---

## 詰まったら（モノレポ × OpenNext のよくある点）

- **ビルドで `@premeet/shared` / `@premeet/worker` が見つからない**
  → Root directory を `apps/web` にすると npm workspaces のリンクが切れることがある。
  その場合は Root を **リポジトリ直下**にし、Build command を
  `npm install && npm --workspace @premeet/web run cf:build`、
  Deploy command を `cd apps/web && npx wrangler deploy` に変える。
- **`RATE_LIMIT` KV が undefined**
  → `wrangler.jsonc` の KV id が `<REPLACE_WITH_KV_ID>` のまま。§4 の実IDを入れて commit。
  （未設定でもメモリにフォールバックするが、本番では複数インスタンス間で共有されない）
- **90秒を超えて生成が落ちる**
  → `docs/02` の Queues 非同期化が本来の設計。まずは動作確認だけならインラインで可。
- **`NEXT_PUBLIC_*` が本番で空になる**
  → Build variables 側に入れていない（Secrets 側だけに入れると画面に焼き込まれない）。

---

## この方式の正直な注意

OpenNext + Cloudflare Workers は本来 **CLI（wrangler）前提**の作りで、Workers Builds
（ブラウザGit接続）でも動くが、モノレポの Root directory とビルド/デプロイコマンドの
組み合わせで初回に詰まりやすい。**最短で確実に動かしたい場合は Vercel**（Node ランタイム
のまま無改造、`docs/09 §7 代替`）も選択肢。レート制限KVだけ Upstash 等に差し替える。
