# pre-meet

> 会社URLを1本入れるだけで、商談前に必要な情報が1枚のリサーチシートになる。

| | |
|---|---|
| リポジトリ名 | `pre-meet` |
| プロダクト名（表示用） | PreMeet（プリミート） |
| 想定ドメイン | premeet.jp ※未取得。要確認 |

## これは何か

BtoB営業パーソンが商談前に行う「相手企業の下調べ」を全自動化するWeb AIアプリ。
企業サイトURL または 企業名を入力すると、公開情報を自動収集し、
**想定課題・刺さる切り口・ヒアリング質問・想定反論** までを構造化して出力する。

## なぜ作るか（勝ち筋）

汎用チャットAIでも似たことはできる。差別化点は以下の3つのみ。

1. **入力コストがゼロに近い** — URL1本。自分でリサーチして貼り付ける作業が不要
2. **求人情報からの課題逆算** — 「情シスを募集中 → 社内DXが手薄」のような推定を自動で行う。手作業ではまずやらない領域
3. **営業用フォーマットへの固定** — 毎回ブレない出力構造。チームで共有できる

> AIの賢さでは差別化できない。**外部データ取得の自動化**が本体である。

## 収益モデル

サブスクではなく **無料 + クレジット買い切り**。

| | 無料 | クレジット |
|---|---|---|
| 回数 | 1日2回（IP+Cookie制限） | 1,000円 / 20クレジット |
| モデル | 低コストモデル | 上位モデル |
| 出力 | 簡易版（4セクション） | 完全版（8セクション） |
| PDF出力 | × | ○ |
| 共有リンク | × | ○ |

無料層は結果ページのアフィリエイト・広告で回収する。
詳細は [docs/06-monetization.md](docs/06-monetization.md)

## 技術スタック

- **Frontend / BFF**: Next.js 15 (App Router) + TypeScript + Tailwind CSS + shadcn/ui
- **Edge API / Cron**: Cloudflare Workers + Queues + Cron Triggers
- **DB**: Supabase (PostgreSQL) ※ RLS必須
- **Storage**: Cloudflare R2（PDF・キャッシュHTML）
- **AI**: Claude API（Haiku / Sonnet の二層構成）
- **決済**: Stripe Checkout（一回払いのみ。サブスク実装なし）
- **Deploy**: Cloudflare Pages（Next.js）+ Workers

## ドキュメント

| ファイル | 内容 |
|---|---|
| [docs/01-requirements.md](docs/01-requirements.md) | 要件定義・スコープ・ユーザーストーリー |
| [docs/02-architecture.md](docs/02-architecture.md) | システム構成・処理フロー・ディレクトリ構成 |
| [docs/03-database.md](docs/03-database.md) | DBスキーマ・RLSポリシー |
| [docs/04-api.md](docs/04-api.md) | APIエンドポイント仕様 |
| [docs/05-prompts.md](docs/05-prompts.md) | プロンプト設計・出力スキーマ |
| [docs/06-monetization.md](docs/06-monetization.md) | 課金・原価防衛・アフィリエイト |
| [docs/07-legal.md](docs/07-legal.md) | 法務・コンプライアンス上の必須対応 |
| [docs/08-roadmap.md](docs/08-roadmap.md) | 開発ロードマップ・検証項目 |
| [CLAUDE.md](CLAUDE.md) | Claude Code 向け開発ガイド |

## 最初にやること

**UIを作る前に、精度検証だけを行う。**

`URL → 求人情報・プレスリリース取得 → 想定課題を出力` の精度が実用水準に
達しなければ、他を何を作っても意味がない。詳細は docs/08-roadmap.md の Phase 0 を参照。

## 開発セットアップ（Phase 0）

現在は **Phase 0（精度検証）** のみ実装済み。UI・決済・認証には未着手。
CLI スクリプト `scripts/verify.ts` で `収集 → Stage1 → Stage2 → JSON出力` を回す。

```bash
# 1. 依存インストール（npm workspaces）
npm install

# 2. 環境変数を用意
cp .env.example .env   # ANTHROPIC_API_KEY を入れる。SEARCH_API_KEY は任意

# 3. 検証を実行（1社ずつ）
npm run verify -- https://example.co.jp            # 完全版（Stage1+2）
npm run verify -- https://example.co.jp --tier free # 無料版（Stage1のみ）
npm run verify -- "株式会社サンプル" --name          # 企業名入力（要 SEARCH_API_KEY）

# 型チェック
npm run typecheck
```

出力は `out/<domain>.json` に保存し、コンソールに採点用サマリーと **原価** を表示する。
docs/08 の合格基準（業種の異なる10社で手採点）に沿って精度を判定する。

### 実装済みの原価防衛（docs/06）

- 収集ページ数の上限（`MAX_PAGES`、既定8）をコードで強制
- 1ページ本文トリム（`MAX_PAGE_CHARS`、既定6,000文字）
- **Stage1 入力の総量上限**（`MAX_TOTAL_CHARS`、既定30,000文字）＝原価の実効的な天井
- 複数ページ共通の**定型文（ナビ/フッター）を除去**して無駄トークンを削減
- `robots.txt` 尊重・UA明示・同一ドメイン **1req/1s**
- 無料層は **Stage2 を実行しない**
- `dataQuality.score < 0.3` は仮説を作らず `THIN_CONTENT`
- AIリトライは **最大1回**、失敗は `AppError('AI_FAILED')`
- 1生成ごとに `cost_usd` を算出し上限（$0.15 / Phase0目標 $0.10）と照合

> Phase 0 の実測で原価が概算（$0.04〜0.08）の約2倍だったため、上限を控えめに調整した。
> 原価は `.env` の `MAX_PAGES` / `MAX_PAGE_CHARS` / `MAX_TOTAL_CHARS` で調整できる。

### ディレクトリ（現状）

```
packages/shared/src/types.ts     # ドメイン型の単一情報源
apps/worker/src/
  ├─ ai/            # schema(zod) / stage1 / stage2 / anthropic クライアント
  ├─ collector/     # robots / fetch-page / discover / search
  ├─ lib/           # env(型付き) / errors(AppError)
  └─ pipeline.ts    # 収集→Stage1→Stage2 の統合
scripts/verify.ts                # Phase 0 検証CLI
```
