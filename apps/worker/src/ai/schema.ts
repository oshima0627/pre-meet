// AI 出力スキーマの単一情報源は packages/shared に移設した（Worker/Web で共有）。
// docs/05 のパス互換と既存 import のため、ここから再輸出する。
export {
  FactsSchema,
  HypothesisSchema,
  type Facts,
  type Hypothesis,
} from '@premeet/shared';
