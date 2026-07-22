'use client';

import { useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase-browser';

// ヘッダー用のログアウト。サインアウト後はトップへ遷移してセッション表示を更新する。
export function LogoutButton() {
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    await getSupabaseBrowser().auth.signOut();
    // 画面全体を再取得してヘッダーのログイン状態を確実に反映させる
    window.location.href = '/';
  }

  return (
    <button
      onClick={logout}
      disabled={loading}
      className="hover:text-slate-900 disabled:opacity-50"
    >
      {loading ? '…' : 'ログアウト'}
    </button>
  );
}
