// `wrangler types` で再生成可能。Workers バインディングの型。
interface CloudflareEnv {
  RATE_LIMIT?: KVNamespace;
  ASSETS: Fetcher;
}
