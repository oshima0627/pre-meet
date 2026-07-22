import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { FactsSchema } from '@premeet/shared';
import { isCacheFresh, type CachedCompany, type ReportRepo } from './repo.js';

// Supabase を使った ReportRepo 実装。書き込みはサービスロール（RLSバイパス）で行う。
// SUPABASE_SERVICE_ROLE_KEY はサーバー側のみ。クライアントに絶対に出さない（CLAUDE.md）。
export function createSupabaseRepo(
  url: string,
  serviceRoleKey: string,
): ReportRepo {
  const db: SupabaseClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });

  return {
    async getFreshCompany(domain, ttlDays) {
      const { data, error } = await db
        .from('companies')
        .select('name, facts, facts_generated_at, source_urls')
        .eq('domain', domain)
        .maybeSingle();
      if (error || !data) return null;

      // 期限切れ・facts 未生成はキャッシュなし扱い
      if (!isCacheFresh(data.facts_generated_at, ttlDays, Date.now())) return null;

      // DB の jsonb を鵜呑みにせず、必ずスキーマ検証してから返す（型安全＝Facts）
      const parsed = FactsSchema.safeParse(data.facts);
      if (!parsed.success) return null;

      const cached: CachedCompany = {
        name: data.name ?? null,
        facts: parsed.data,
        sourceUrls: (data.source_urls as string[] | null) ?? [],
      };
      return cached;
    },

    async saveCompanyFacts({ domain, name, facts, sourceUrls, crawlBlocked }) {
      const now = new Date().toISOString();
      const { error } = await db.from('companies').upsert(
        {
          domain,
          name,
          facts,
          facts_generated_at: now,
          source_urls: sourceUrls,
          crawl_blocked: crawlBlocked ?? false,
          updated_at: now,
        },
        { onConflict: 'domain' },
      );
      if (error) {
        // キャッシュ保存失敗は致命ではない（次回また生成すればよい）。呼び出し側で握る
        throw new Error(`companies upsert 失敗: ${error.message}`);
      }
    },
  };
}
