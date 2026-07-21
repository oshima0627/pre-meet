# 04. API 仕様

共通事項

- 形式：JSON
- 匿名ユーザーは Cookie `pm_anon`（UUID）で識別。未発行なら初回アクセス時にサーバーで発行
- エラーレスポンスは統一形式

```json
{ "error": { "code": "RATE_LIMITED", "message": "本日の無料利用回数を超えました" } }
```

| コード | HTTP | 意味 |
|---|---|---|
| `INVALID_INPUT` | 400 | URL/企業名が不正 |
| `RATE_LIMITED` | 429 | 無料回数超過 |
| `INSUFFICIENT_CREDIT` | 402 | クレジット不足 |
| `ROBOTS_BLOCKED` | 422 | robots.txt により取得不可 |
| `FETCH_FAILED` | 422 | サイト取得失敗 |
| `THIN_CONTENT` | 422 | 情報量不足で生成中止 |
| `AI_FAILED` | 500 | 生成失敗（クレジット返還済み） |

---

## POST /api/research

リサーチ生成を開始する。

**Request**

```json
{
  "input": "https://example.co.jp",
  "inputType": "url",            // url | name
  "tier": "free",                // free | paid
  "ownContext": {                // 任意。指定すると切り口の精度が上がる
    "companyName": "Nexeed Lab",
    "serviceSummary": "中小企業向けの業務システム受託開発",
    "targetCustomer": "従業員10〜100名の地方企業"
  }
}
```

**Response 202**

```json
{
  "reportId": "0f2c...",
  "slug": "a7fk2x",
  "status": "queued",
  "cached": false
}
```

**処理順序（この順を守ること）**

1. 入力バリデーション（URL形式 / 企業名2文字以上）
2. ドメイン正規化
3. **7日以内のキャッシュ確認** → あれば即 `done` で返す（クレジット消費なし）
4. `tier=free` → KVでレート制限判定
5. `tier=paid` → `consume_credit` RPC 実行。失敗なら 402
6. `research_reports` に `queued` で INSERT
7. Queue に投入して 202 を返す

> **クレジット消費はキャッシュ確認より後。** 順序を間違えると、
> キャッシュヒットなのに課金するという最悪の不具合になる。

---

## GET /api/status/[reportId]

進捗を取得する。クライアントは2秒間隔でポーリング。

**Response 200**

```json
{
  "status": "generating",
  "progress": {
    "step": "collecting",           // collecting | analyzing | generating | done
    "message": "採用情報を確認しています",
    "pagesFetched": 6
  },
  "report": null
}
```

完了時

```json
{
  "status": "done",
  "report": {
    "slug": "a7fk2x",
    "tier": "paid",
    "company": { "name": "株式会社Example", "domain": "example.co.jp" },
    "facts": { /* docs/05 の FactsSchema */ },
    "hypothesis": { /* docs/05 の HypothesisSchema */ },
    "sourceUrls": ["https://example.co.jp/", "https://example.co.jp/recruit"],
    "generatedAt": "2026-07-21T09:00:00Z"
  }
}
```

進捗メッセージは体感速度に直結する。**固定文言ではなく、実際の処理段階を出すこと。**

---

## GET /r/[slug]（ページ）

結果ページ。`is_public = true` の場合のみ第三者が閲覧可能。

- OGP画像を動的生成（`@vercel/og` 相当）→ SNS共有時の流入源になる
- 無料版では 5〜8 のセクションを**ぼかし表示 + アンロックボタン**で見せる
  - 完全に非表示にしない。「何が得られるか」が見えないと課金されない

---

## POST /api/share/[reportId]

共有リンクを有効化する（`is_public` を true に）。

```json
{ "url": "https://premeet.jp/r/a7fk2x" }
```

---

## POST /api/checkout

Stripe Checkout セッションを作成。

**Request**

```json
{ "pack": "standard" }   // starter | standard | pro
```

**Response**

```json
{ "url": "https://checkout.stripe.com/..." }
```

- `mode: "payment"`（**サブスクではない**）
- `client_reference_id` に user_id を入れる
- 未ログインの場合は先にログインへ誘導（決済にはアカウントが必要）

---

## POST /api/stripe/webhook

**必ず署名検証を行うこと。** 検証なしで残高を増やすと、リクエスト偽造で無限クレジットになる。

処理するイベント

| イベント | 処理 |
|---|---|
| `checkout.session.completed` | payments を paid に更新 + credit_ledger に付与 |
| `charge.refunded` | クレジットをマイナス計上（残高が負になることは許容） |

冪等性は `credit_ledger.stripe_payment_intent_id` のユニーク制約で担保する。
Stripeは同じWebhookを複数回送るため、これがないと二重付与が発生する。

---

## GET /api/credits

```json
{ "balance": 17, "expiresAt": "2027-01-21T00:00:00Z" }
```

---

## 内部API（Next.js → Worker）

`Authorization: Bearer ${INTERNAL_API_TOKEN}` 必須。
Worker のエンドポイントは公開しない。CORSも自ドメインのみ許可する。

---

## レート制限（無料層）

KV に以下のキーで記録。

```
rl:anon:{anonId}:{YYYYMMDD}   → 回数
rl:ip:{hash(ip)}:{YYYYMMDD}   → 回数
```

- 匿名：**1日2回**
- ログイン済み無料：**1日3回**
- IP単位：**1日10回**（Cookie削除による回避を防ぐ）
- TTL は 48時間で自動失効

> IP制限は必須。Cookieだけだとシークレットウィンドウで無限に使われ、原価が青天井になる。
