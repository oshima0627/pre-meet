import Anthropic from '@anthropic-ai/sdk';
import type { z } from 'zod';
import type { ModelUsage } from '@premeet/shared';
import { AppError } from '../lib/errors.js';
import { getPricing, type ThinkingMode } from '../lib/env.js';
import { coerceNullArrays } from './coerce.js';

export interface StructuredResult<T> {
  data: T;
  usage: ModelUsage;
}

interface RunOptions {
  thinking?: ThinkingMode;
  maxTokens?: number;
}

// 出力はJSONのみを要求しているが、モデルが ```json ... ``` を付けることがある。
// zod 検証前に防御的に剥がす（docs/05 の前提を崩さないための保険）。
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  return fenced && fenced[1] !== undefined ? fenced[1].trim() : trimmed;
}

export function createAnthropic(apiKey: string): Anthropic {
  return new Anthropic({ apiKey });
}

// 単一のAI呼び出し。テキストを受け取り JSON→zod で検証して返す。
// パース/検証に失敗したら「1回だけ」再生成する（docs/05・原価事故防止）。
export async function runStructured<T>(
  client: Anthropic,
  params: {
    model: string;
    prompt: string;
    schema: z.ZodType<T>;
  },
  options: RunOptions = {},
): Promise<StructuredResult<T>> {
  const { model, prompt, schema } = params;
  const thinking: ThinkingMode = options.thinking ?? 'disabled';
  const maxTokens = options.maxTokens ?? 8000;
  const pricing = getPricing(model);

  // リトライを跨いでトークンを積算する（原価は全消費分で評価する）
  let inputTokens = 0;
  let outputTokens = 0;
  let lastError: unknown;

  // 最大2回（初回 + リトライ1回）。無制限リトライは禁止（CLAUDE.md）
  for (let attempt = 0; attempt < 2; attempt++) {
    let text: string;
    try {
      const res = await client.messages.create({
        model,
        max_tokens: maxTokens,
        thinking: { type: thinking },
        messages: [{ role: 'user', content: prompt }],
      });
      inputTokens += res.usage.input_tokens;
      outputTokens += res.usage.output_tokens;
      text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');
    } catch (err) {
      // API 呼び出し自体の失敗もリトライ対象にする
      lastError = err;
      continue;
    }

    try {
      const json: unknown = JSON.parse(stripCodeFence(text));
      // 配列項目の null を [] に補正してから検証（LLM の null 返しで落ちるのを防ぐ）
      coerceNullArrays(schema, json);
      const data = schema.parse(json);
      return {
        data,
        usage: {
          model,
          inputTokens,
          outputTokens,
          costUsd:
            inputTokens * pricing.inputPerToken +
            outputTokens * pricing.outputPerToken,
        },
      };
    } catch (err) {
      lastError = err; // JSON パース or zod 検証の失敗 → 次の試行へ
    }
  }

  throw new AppError(
    'AI_FAILED',
    lastError instanceof Error ? lastError.message : String(lastError),
  );
}
