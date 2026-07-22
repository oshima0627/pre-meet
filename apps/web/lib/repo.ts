import { loadConfig, createSupabaseRepo, type ReportRepo } from '@premeet/worker';

// サーバー側で使う Supabase リポジトリ（サービスロール）。
// SUPABASE_SERVICE_ROLE_KEY はサーバー側のみ。クライアントに絶対に出さない（CLAUDE.md）。
export function getServerRepo(): ReportRepo {
  const config = loadConfig();
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です');
  }
  return createSupabaseRepo(config.supabaseUrl, config.supabaseServiceRoleKey);
}
