import { z } from 'zod';

// AI 出力は必ず zod で検証する（CLAUDE.md）。docs/05 のスキーマに対応。
// Facts / Hypothesis の型はここ（packages/shared）を単一情報源とし、
// Worker と Web の両方が同じ型・スキーマを使う（docs/02）。
// ※ LLM が空配列を null で返す件は、パース直前に coerceNullArrays で
//   スキーマ駆動で補正する（apps/worker/src/ai/coerce.ts）。スキーマ自体は厳密に保つ。

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
  services: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      source: z.string(),
    }),
  ),
  customers: z.object({
    segments: z.array(z.string()),
    namedClients: z.array(z.string()),
    source: z.string().nullable(),
  }),
  recentNews: z.array(
    z.object({
      date: z.string().nullable(),
      title: z.string(),
      summary: z.string(),
      source: z.string(),
    }),
  ),
  hiring: z.object({
    // LLM が判断できず null を返すことがある。画面表示には使わない補助フラグなので、
    // パース直前に coerce 側で null→false に補正し、生成全体を失敗させない（docs/05）。
    isHiring: z.boolean(),
    openPositions: z.array(
      z.object({
        title: z.string(),
        department: z.string().nullable(),
        note: z.string().nullable(),
      }),
    ),
    source: z.string().nullable(),
  }),
  techStack: z.array(z.string()),
  dataQuality: z.object({
    score: z.number().min(0).max(1),
    missing: z.array(z.string()),
  }),
});

export const HypothesisSchema = z.object({
  hypotheses: z
    .array(
      z.object({
        title: z.string(),
        detail: z.string(),
        evidence: z.string().min(1), // 空の根拠は許さない（docs/05 の原則）
        confidence: z.enum(['high', 'medium', 'low']),
      }),
    )
    .min(1)
    .max(5),
  angles: z
    .array(
      z.object({
        title: z.string(),
        opening: z.string(),
        why: z.string(),
        risk: z.string(),
      }),
    )
    .max(5),
  questions: z
    .array(
      z.object({
        question: z.string(),
        intent: z.string(),
        category: z.string(),
      }),
    )
    .max(12),
  objections: z
    .array(
      z.object({
        objection: z.string(),
        realMeaning: z.string(),
        response: z.string(),
        avoid: z.string(),
      }),
    )
    .max(6),
  orgGuess: z.object({
    likelyDepartments: z.array(z.string()),
    reasoning: z.string(),
    caution: z.string(),
  }),
});

export type Facts = z.infer<typeof FactsSchema>;
export type Hypothesis = z.infer<typeof HypothesisSchema>;
