# CLAUDE.md — 開発ガイド（pre-meet）

このリポジトリで作業する際の指針。作業前に必ず `docs/` を参照すること。

## プロジェクト概要

PreMeet（リポジトリ名: `pre-meet`） — 会社URLを入力すると商談前リサーチシートをAI生成するWebアプリ。
収益モデルは **サブスクではなくクレジット買い切り**。無人運用が前提。

## 最重要の設計原則

1. **原価防衛を最優先する。** 個人開発の無人運用のため、AI呼び出しの上限・
   レート制限・キャッシュ・サーキットブレーカーは機能ではなく前提条件。
   これらを省いた実装は受け入れない
2. **事実と推測を混ぜない。** Stage1（事実抽出）とStage2（仮説構築）は必ず分離する
3. **個人情報を扱わない。** 個人名・名刺情報を保存するカラムやフォームを追加しない
4. **失敗時はクレジットを返す。** 返金対応という「実作業」を発生させない

## 技術スタック

- Next.js 15 (App Router) / TypeScript / Tailwind CSS / shadcn/ui
- Cloudflare Workers + Queues + KV + R2
- Supabase (PostgreSQL, Auth) ※ RLS必須
- Claude API（Stage1=安価モデル / Stage2=上位モデル）
- Stripe Checkout（`mode: "payment"` のみ。サブスクは実装しない）

## コーディング規約

- **コメントは日本語**で書く。なぜそうしているかを書く（何をしているかは書かない）
- 型は `packages/shared/types.ts` を単一の情報源とする。Worker と Web で重複定義しない
- AI出力は必ず zod で検証する。`as any` でのバイパス禁止
- 環境変数は必ず型付きで読む。直接 `process.env.X!` を書かない
- エラーは `AppError(code)` に統一。docs/04 のエラーコード表に従う

## ディレクトリ

```
apps/web/      Next.js（画面・BFF・Stripe Webhook）
apps/worker/   Cloudflare Workers（収集・AI生成・Queue）
packages/shared/  型定義
supabase/migrations/  DBマイグレーション
scripts/       検証用CLI
```

## 実装時の必須チェック

新しくAI呼び出しやクロール処理を追加する際は、以下を必ず確認する。

- [ ] 呼び出し回数に上限があるか
- [ ] 入力トークンにトリムがかかっているか
- [ ] キャッシュで回避できないか
- [ ] 失敗時にクレジットが返るか
- [ ] リトライは最大1回か

## 禁止事項

- サブスクリプション課金の実装
- 個人情報を保存するスキーマの追加
- robots.txt を無視するクロール
- AI呼び出しの無制限リトライ
- `SUPABASE_SERVICE_ROLE_KEY` をクライアント側で参照すること
- Stripe Webhook の署名検証を省くこと

## 現在のフェーズ

**Phase 0（精度検証）**

`scripts/verify.ts` の実装と、10社での検証が最優先。
UI・決済・認証には着手しない。詳細は docs/08-roadmap.md を参照。
