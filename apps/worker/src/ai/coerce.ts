import { z } from 'zod';

// LLM は「該当なし」を空配列 [] ではなく null で返すことがある。
// スキーマ上で「配列を期待する箇所」に限って null/undefined を [] に補正する。
// 補正対象をハードコードせずスキーマ自体を情報源にするため、配列項目の二重管理を避けられる。
// （as any は使わず、zod の内部 def へは最小限の型付きアクセスのみ行う）

// Optional / Nullable / Default / Effects を剥がして基底の型に到達する
function unwrap(schema: z.ZodTypeAny): z.ZodTypeAny {
  let s = schema;
  for (;;) {
    const def = s._def as { innerType?: z.ZodTypeAny; schema?: z.ZodTypeAny };
    if (def.innerType) {
      s = def.innerType; // Optional / Nullable / Default
    } else if (def.schema) {
      s = def.schema; // Effects
    } else {
      return s;
    }
  }
}

// value を（必要なら破壊的に）補正して返す。schema が配列を期待する位置の
// null/undefined を [] にする。ネストしたオブジェクトは再帰的に処理する。
export function coerceNullArrays(schema: z.ZodTypeAny, value: unknown): unknown {
  const base = unwrap(schema);

  if (base instanceof z.ZodObject) {
    if (value === null || typeof value !== 'object') return value;
    const shape = base.shape as Record<string, z.ZodTypeAny>;
    const obj = value as Record<string, unknown>;
    for (const [key, child] of Object.entries(shape)) {
      const childBase = unwrap(child);
      if (childBase instanceof z.ZodArray) {
        if (obj[key] === null || obj[key] === undefined) obj[key] = [];
      } else if (childBase instanceof z.ZodObject) {
        coerceNullArrays(child, obj[key]); // ネストしたオブジェクトを辿る
      }
    }
  }
  return value;
}
