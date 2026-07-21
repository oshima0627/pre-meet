# 05. プロンプト設計

> **このドキュメントがプロダクトの本体。** UIやインフラは代替可能だが、
> ここの品質がそのまま商品価値になる。

## 設計原則

1. **事実と推測を絶対に混ぜない。** Stage1で事実だけを抽出し、Stage2で仮説を立てる
2. **推測には必ず根拠（evidence）を持たせる。** 根拠を書けない仮説は出力させない
3. **情報がない場合は `null` を返させる。** 埋めさせようとするとハルシネーションが起きる
4. **出力はJSONのみ。** 前置き・マークダウン記法を禁止し、zodで検証する
5. **断定表現を禁止する。** 「〜と推測されます」「〜の可能性があります」に統一（法務要件でもある）

---

## Stage 1: 事実抽出

- モデル：低コストモデル（Haiku相当）
- 入力：収集したページ本文（最大10ページ / 各8,000文字）
- 出力：`facts` JSON（セクション1〜4）
- **無料ユーザーはここまで**

```typescript
// apps/worker/src/ai/stage1-facts.ts

export const buildStage1Prompt = (pages: CollectedPage[]) => `
あなたは企業調査の専門アナリストです。
以下は、ある企業の公式Webサイトおよび公開情報から取得したテキストです。
ここから「事実として書かれている情報」だけを抽出し、構造化してください。

# 絶対に守るルール
- テキストに書かれていない情報を推測で補ってはいけません
- 不明な項目は必ず null を返してください。空文字や「不明」という文字列は禁止です
- あなた自身の意見・分析・提案は一切含めないでください（後工程で行います）
- 各項目には、その情報が記載されていたURLを source として必ず付けてください
- 出力はJSONのみ。前置き、後書き、\`\`\` によるコードブロック記法は禁止です

# 抽出対象テキスト
${pages.map(p => `
--- URL: ${p.url} ---
${p.text}
`).join('\n')}

# 出力スキーマ
{
  "companyName": "正式社名（株式会社の位置も含めて正確に）",
  "summary": "事業内容を3〜4文で。サイトの記述に忠実に",
  "basicInfo": {
    "founded": "設立年（例: 2015年）| null",
    "employees": "従業員数の記載 | null",
    "capital": "資本金 | null",
    "locations": ["拠点1", "拠点2"],
    "representative": "代表者名 | null",
    "listed": "上場区分の記載 | null"
  },
  "services": [
    { "name": "サービス名", "description": "1〜2文", "source": "URL" }
  ],
  "customers": {
    "segments": ["主要顧客層の記載"],
    "namedClients": ["導入事例として明記されている企業名"],
    "source": "URL | null"
  },
  "recentNews": [
    { "date": "YYYY-MM | null", "title": "見出し", "summary": "1文", "source": "URL" }
  ],
  "hiring": {
    "isHiring": true,
    "openPositions": [
      { "title": "職種名", "department": "部門 | null", "note": "必須スキル等の記載 | null" }
    ],
    "source": "URL | null"
  },
  "techStack": ["求人・技術ブログ等で明記されている技術名"],
  "dataQuality": {
    "score": 0.0,
    "missing": ["取得できなかった重要項目"]
  }
}

# dataQuality について
score は 0.0〜1.0 で、収集できた情報の充足度を自己評価してください。
0.3未満の場合、後工程での仮説構築は行いません。正直に評価してください。
`;
```

**`dataQuality.score` が 0.3 未満なら Stage2 を実行せず、`THIN_CONTENT` で中断してクレジットを返す。**
情報が薄い企業に対して無理に仮説を作らせると、確実に的外れな出力になり信頼を失う。

---

## Stage 2: 仮説構築

- モデル：上位モデル（Sonnet相当）
- 入力：**Stage1のfacts JSONのみ**（生テキストは渡さない → トークン1/10）
- 出力：`hypothesis` JSON（セクション5〜8）
- 有料のみ

```typescript
// apps/worker/src/ai/stage2-hypothesis.ts

export const buildStage2Prompt = (
  facts: Facts,
  own: OwnContext | null
) => `
あなたは法人営業の戦略コンサルタントです。
以下は、これから商談する相手企業について調査した「事実情報」です。
この事実のみを根拠に、営業担当者が商談で使える仮説を構築してください。

# 相手企業の事実情報
${JSON.stringify(facts, null, 2)}

${own ? `
# 営業担当者（あなたの依頼主）の情報
自社名: ${own.companyName}
提供サービス: ${own.serviceSummary}
想定顧客: ${own.targetCustomer}

上記を踏まえ、この自社サービスの文脈で刺さる切り口を考えてください。
` : `
# 注意
営業担当者の自社サービス情報は提供されていません。
業種を問わず有効な、汎用的な切り口として構築してください。
`}

# 絶対に守るルール
- すべての仮説に evidence（上記の事実情報のどの記述に基づくか）を必ず付けること
- evidence を書けない仮説は出力しないこと。数が減っても構いません
- 断定を避け、「〜と推測されます」「〜の可能性があります」の語尾を使うこと
- 相手企業を批判・断罪する表現は禁止（例: 「体制が遅れている」→「体制強化の余地がある」）
- 特定の個人（役員名等）に踏み込んだ推測は禁止。組織単位でのみ論じること
- 出力はJSONのみ。前置き、後書き、コードブロック記法は禁止

# 特に重視してほしい観点
採用情報は「今その企業が金と人を投じている領域」を示す最も正直なシグナルです。
どの職種を、どの部門で募集しているかから、社内で何が不足しているかを逆算してください。
（例: 情報システム担当を募集 → 社内システムの運用が属人化している可能性）

# 出力スキーマ
{
  "hypotheses": [
    {
      "title": "想定課題を一言で",
      "detail": "2〜3文での説明",
      "evidence": "この仮説の根拠となる事実（factsのどの記述か）",
      "confidence": "high | medium | low"
    }
  ],
  "angles": [
    {
      "title": "切り口の名前",
      "opening": "商談冒頭で使える切り出し文（そのまま話せる口語で。2〜3文）",
      "why": "なぜこの切り口が有効と考えられるか",
      "risk": "この切り口が外れる場合の条件"
    }
  ],
  "questions": [
    {
      "question": "ヒアリング質問（そのまま口に出せる形で）",
      "intent": "この質問で何を確かめたいか",
      "category": "現状把握 | 課題深掘り | 決裁構造 | 予算 | 時期"
    }
  ],
  "objections": [
    {
      "objection": "想定される断り文句",
      "realMeaning": "その言葉の裏にある可能性が高い本音",
      "response": "返し方（そのまま話せる口語で）",
      "avoid": "この場面でやってはいけない対応"
    }
  ],
  "orgGuess": {
    "likelyDepartments": ["アプローチすべき部門"],
    "reasoning": "採用職種や組織記述からの推定根拠",
    "caution": "推定であり実際の組織構造とは異なる可能性がある旨"
  }
}

# 個数の指定
hypotheses: 3件 / angles: 3件 / questions: 10件 / objections: 5件
ただし、根拠が不十分な項目を数合わせで生成することは禁止です。
`;
```

---

## 出力検証（zod）

```typescript
// apps/worker/src/ai/schema.ts
import { z } from 'zod';

export const FactsSchema = z.object({
  companyName: z.string(),
  summary: z.string(),
  basicInfo: z.object({
    founded: z.string().nullable(),
    employees: z.string().nullable(),
    capital: z.string().nullable(),
    locations: z.array(z.string()),
    representative: z.string().nullable(),
    listed: z.string().nullable(),
  }),
  services: z.array(z.object({
    name: z.string(),
    description: z.string(),
    source: z.string(),
  })),
  customers: z.object({
    segments: z.array(z.string()),
    namedClients: z.array(z.string()),
    source: z.string().nullable(),
  }),
  recentNews: z.array(z.object({
    date: z.string().nullable(),
    title: z.string(),
    summary: z.string(),
    source: z.string(),
  })),
  hiring: z.object({
    isHiring: z.boolean(),
    openPositions: z.array(z.object({
      title: z.string(),
      department: z.string().nullable(),
      note: z.string().nullable(),
    })),
    source: z.string().nullable(),
  }),
  techStack: z.array(z.string()),
  dataQuality: z.object({
    score: z.number().min(0).max(1),
    missing: z.array(z.string()),
  }),
});

export const HypothesisSchema = z.object({
  hypotheses: z.array(z.object({
    title: z.string(),
    detail: z.string(),
    evidence: z.string().min(1),          // 空の根拠は許さない
    confidence: z.enum(['high', 'medium', 'low']),
  })).min(1).max(5),
  angles: z.array(z.object({
    title: z.string(),
    opening: z.string(),
    why: z.string(),
    risk: z.string(),
  })).max(5),
  questions: z.array(z.object({
    question: z.string(),
    intent: z.string(),
    category: z.string(),
  })).max(12),
  objections: z.array(z.object({
    objection: z.string(),
    realMeaning: z.string(),
    response: z.string(),
    avoid: z.string(),
  })).max(6),
  orgGuess: z.object({
    likelyDepartments: z.array(z.string()),
    reasoning: z.string(),
    caution: z.string(),
  }),
});
```

**パース失敗時は1回だけ再生成**し、それでも失敗ならクレジット返還して `AI_FAILED`。
無限リトライは原価事故になるので絶対に実装しないこと。

---

## 品質検証のやり方（Phase 0 で必ず実施）

以下を手作業で採点する。**UIを作る前にこれをやる。**

| 検証項目 | 合格基準 |
|---|---|
| 事実の正確性 | Stage1の出力に、サイトに書かれていない記述が混入していない（10社中10社） |
| 課題仮説の妥当性 | 「言われてみればそうだ」と思える仮説が3件中2件以上 |
| evidence の追跡性 | 全仮説の根拠が facts 内に実在する |
| 切り口の実用性 | opening をそのまま読み上げても不自然でない |
| 汎用性の排除 | 「DXを推進したいのでは」等、どの企業にも当てはまる出力になっていない |

**最後の項目が最重要。** 汎用的な出力しか出ないなら、この商品は成立しない。
検証には、業種の異なる10社（IT / 製造 / 小売 / 建設 / 医療 / 士業 など）を使うこと。

---

## モデル選択の指針

| 用途 | モデル | 理由 |
|---|---|---|
| Stage1（事実抽出） | Haiku系 | 抽出タスクは安価なモデルで十分。入力が大きいのでここを安くする効果が最大 |
| Stage2（仮説構築） | Sonnet系 | 推論品質が商品価値に直結。ここはケチらない |
| 無料層 | Stage1のみ | Stage2を実行しないことで原価が1/5以下になる |

※ 具体的なモデル名・価格は変動するため、実装時に公式ドキュメントで最新を確認すること。
コード内では環境変数でモデル名を差し替えられるようにしておく。
