import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

// サーバー側の Supabase クライアント（ユーザーセッション付き）。
// anon key を使い、Cookie のセッションで RLS を効かせる（service_role は使わない）。
export async function getSupabaseServer() {
  const store = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / ANON_KEY が未設定です');
  }
  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(
        cookiesToSet: {
          name: string;
          value: string;
          options?: Record<string, unknown>;
        }[],
      ) {
        // Route Handler / Server Action からのみ書き込み可能
        try {
          for (const { name, value, options } of cookiesToSet) {
            store.set(name, value, options);
          }
        } catch {
          // Server Component からの呼び出しでは無視（middleware で更新する想定）
        }
      },
    },
  });
}

// ログインユーザーの ID を返す（未ログインは null）。匿名利用を前提にするため
// null を許容する（docs/03: user_id は nullable）。
export async function getUserId(): Promise<string | null> {
  try {
    const supabase = await getSupabaseServer();
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}
