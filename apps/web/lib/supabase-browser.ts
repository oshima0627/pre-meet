'use client';

import { createBrowserClient } from '@supabase/ssr';

// ブラウザ側 Supabase クライアント（ログインUI用）。anon key のみ使う。
export function getSupabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error('Supabase の環境変数が未設定です');
  return createBrowserClient(url, anon);
}
