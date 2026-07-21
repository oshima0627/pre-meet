# 02. アーキテクチャ

## 1. 全体構成

```
[ブラウザ]
   │  ① URL入力 / POST /api/research
   ▼
[Next.js (Cloudflare Pages)]  ── 画面・結果表示・SEOページ
   │  ② ジョブ登録
   ▼
[Cloudflare Workers: API]
   ├─ レート制限判定（KV）
   ├─ クレジット残高確認（Supabase）
   └─ Queue へ投入
        │
        ▼
[Cloudflare Queues] ──▶ [Workers: Consumer]
                            ├─ ③ 自社サイト取得（fetch + robots.txt確認）
                            ├─ ④ 採用ページ探索
                            ├─ ⑤ Web検索API（ニュース）
                            ├─ ⑥ Claude API 呼び出し（2段階）
                            └─ ⑦ Supabase へ結果保存
                                     │
                                     ▼
                            [ブラウザがポーリング / SSE で受信]
```

**Cloudflare Workers だけで完結させる。** 動画処理などの重い依存がないため、
Cloud Run 等の追加インフラは不要。運用負荷ゼロを維持する。

## 2. 処理フロー詳細

### Step 1: 入力の正規化

- URL入力 → ドメイン抽出、`https://` 補完、末尾スラッシュ除去
- 企業名入力 → Web検索で公式サイトを特定（第1候補を採用、ユーザーに確認させる）
- **同一ドメインの既存結果が7日以内にあればキャッシュを返す**（原価削減の要）

### Step 2: 収集（Collector）

| ソース | 取得方法 | 失敗時 |
|---|---|---|
| トップページ | fetch → HTML→テキスト抽出 | 中断（必須） |
| 会社概要 / About | `/company`, `/about`, `/corporate` を探索 | スキップ |
| サービス一覧 | ナビゲーションリンクから推定、最大5ページ | スキップ |
| ニュース・IR | サイト内 + Web検索API | スキップ |
| 採用情報 | `/recruit`, `/careers` + 求人検索 | スキップ |

**制約**
- 取得ページ数の上限：**10ページ**（原価・時間の防衛線）
- 1ページあたり本文 **8,000文字**でトリム
- `robots.txt` を必ず確認し、Disallow のパスは取得しない
- User-Agent を明示（`PreMeetBot/1.0 (+https://premeet.jp/bot)`）
- 同一ドメインへのリクエストは **1秒に1回**まで

### Step 3: 生成（2段階）

1段目で「事実の抽出」、2段目で「仮説の構築」に分ける。
**1段階で全部やらせると、事実と推測が混ざって信頼性が崩れる。**

```
[収集テキスト] ──▶ Stage1: 事実抽出（低コストモデル）
                        │  → facts JSON（セクション1〜4）
                        ▼
                   Stage2: 仮説構築（上位モデル）
                        │  ※ facts JSON のみを入力。生テキストは渡さない
                        ▼
                   → hypothesis JSON（セクション5〜8）
```

- 無料ユーザーは **Stage1 のみ実行**。Stage2 をスキップするので原価が劇的に下がる
- Stage2 の入力を facts JSON に絞ることで、トークン量が1/10以下になる

### Step 4: 保存・表示

- 結果は `research_reports` に保存
- 共有用に短いスラッグ（例: `/r/a7fk2x`）を発行
- PDF は生成時ではなく **ダウンロード要求時に生成**（無駄な原価を出さない）

## 3. ディレクトリ構成

```
pre-meet/
├── apps/
│   ├── web/                      # Next.js 15 (App Router)
│   │   ├── app/
│   │   │   ├── page.tsx                 # LP兼入力フォーム
│   │   │   ├── r/[slug]/page.tsx        # 結果ページ（共有可・OGP対応）
│   │   │   ├── pricing/page.tsx
│   │   │   ├── (legal)/terms/page.tsx
│   │   │   ├── (legal)/privacy/page.tsx
│   │   │   ├── (legal)/tokushoho/page.tsx  # 特定商取引法表記（必須）
│   │   │   ├── blog/[slug]/page.tsx     # SEO記事（集客の生命線）
│   │   │   └── api/
│   │   │       ├── research/route.ts    # 生成リクエスト受付
│   │   │       ├── status/[id]/route.ts # ポーリング
│   │   │       └── stripe/webhook/route.ts
│   │   ├── components/
│   │   │   ├── research-form.tsx
│   │   │   ├── report-view.tsx
│   │   │   ├── locked-section.tsx       # 有料セクションのぼかし表示
│   │   │   └── credit-badge.tsx
│   │   └── lib/
│   │       ├── supabase.ts
│   │       └── stripe.ts
│   └── worker/                   # Cloudflare Workers
│       ├── src/
│       │   ├── index.ts                 # ルーティング
│       │   ├── consumer.ts              # Queue コンシューマ
│       │   ├── collector/
│       │   │   ├── fetch-page.ts
│       │   │   ├── robots.ts
│       │   │   ├── discover.ts          # 会社概要・採用ページ探索
│       │   │   └── search.ts            # Web検索API
│       │   ├── ai/
│       │   │   ├── stage1-facts.ts
│       │   │   ├── stage2-hypothesis.ts
│       │   │   └── schema.ts            # zod スキーマ
│       │   ├── ratelimit.ts             # KVベース
│       │   └── credits.ts
│       └── wrangler.toml
├── packages/
│   └── shared/                   # 型定義の共有
│       └── types.ts
├── supabase/
│   └── migrations/
└── docs/
```

**モノレポにする理由**：Worker と Next.js で `ResearchReport` 型を共有するため。
型がズレると結果表示が壊れるので、`packages/shared` を単一の情報源にする。

## 4. 環境変数

```bash
# --- Next.js (apps/web/.env.local) ---
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # サーバー側のみ。クライアントに絶対出さない
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_APP_URL=https://premeet.jp
WORKER_API_URL=
WORKER_API_TOKEN=                 # Next.js → Worker の内部認証

# --- Workers (wrangler secret put) ---
ANTHROPIC_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SEARCH_API_KEY=                   # Web検索API
INTERNAL_API_TOKEN=
```

```toml
# wrangler.toml（抜粋）
[[queues.producers]]
queue = "research-jobs"
binding = "RESEARCH_QUEUE"

[[queues.consumers]]
queue = "research-jobs"
max_batch_size = 1
max_retries = 2
dead_letter_queue = "research-dlq"

[[kv_namespaces]]
binding = "RATE_LIMIT"
id = "xxxx"

[[r2_buckets]]
binding = "CACHE"
bucket_name = "pre-meet-cache"
```

## 5. エラーハンドリング方針

| ケース | 挙動 |
|---|---|
| サイトが取得できない（403/タイムアウト） | 「取得できませんでした」+ 企業名での検索モードを提案 |
| robots.txt で禁止 | 即座に中断し、理由を明示。**クレジットは消費しない** |
| 収集情報が極端に少ない | 生成を実行せず警告。**クレジットは消費しない** |
| AI呼び出し失敗 | 1回リトライ → 失敗ならクレジット返還 |
| JSONパース失敗 | zodで検証。失敗時は1回だけ再生成 |

> **原則：価値ある結果を返せなかった場合、クレジットは必ず返す。**
> ここをケチると返金対応という「実作業」が発生し、無人運用が壊れる。
