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
