import type { CollectedPage } from '@premeet/shared';

// Stage 1: 事実抽出（docs/05）。
// 収集テキストから「書かれている事実」だけを構造化する。推測はここでは一切させない。
export const buildStage1Prompt = (pages: CollectedPage[]): string => `
あなたは企業調査の専門アナリストです。
以下は、ある企業の公式Webサイトおよび公開情報から取得したテキストです。
ここから「事実として書かれている情報」だけを抽出し、構造化してください。

# 絶対に守るルール
- テキストに書かれていない情報を推測で補ってはいけません
- 不明な項目は必ず null を返してください。空文字や「不明」という文字列は禁止です
- ただし配列項目（services / locations / recentNews / openPositions / techStack 等）は、
  該当が無くても null ではなく空配列 [] を返してください
- あなた自身の意見・分析・提案は一切含めないでください（後工程で行います）
- 各項目には、その情報が記載されていたURLを source として必ず付けてください
- 出力はJSONのみ。前置き、後書き、\`\`\` によるコードブロック記法は禁止です

# 抽出対象テキスト
${pages
  .map(
    (p) => `
--- URL: ${p.url} ---
${p.text}
`,
  )
  .join('\n')}

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
