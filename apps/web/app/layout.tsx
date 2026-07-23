import type { Metadata } from 'next';
import './globals.css';
import { SiteHeader } from '@/components/site-header';

export const metadata: Metadata = {
  title: 'PreMeet — 会社URLで商談前リサーチを1枚に',
  description:
    'BtoB営業の商談前リサーチを自動化。企業URLを入れるだけで、想定課題・切り口・ヒアリング質問・想定反論までを構造化して出力します。',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        {/* ヘッダーは画面上部に貼り付け、スクロールでもブランドと残高を常に見せる。
            半透明＋ブラーで背景のグラデが透けるモダンな見せ方にする。 */}
        <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/70 backdrop-blur-md">
          <div className="mx-auto max-w-4xl px-4">
            <SiteHeader />
          </div>
        </header>

        <div className="mx-auto max-w-4xl px-4 py-8 sm:py-10">
          <div className="animate-fade-up">{children}</div>

          <footer className="mt-20 border-t border-slate-200/70 pt-6 text-xs text-slate-500">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <a href="/terms" className="transition hover:text-slate-800">
                利用規約
              </a>
              <a href="/privacy" className="transition hover:text-slate-800">
                プライバシーポリシー
              </a>
              <a href="/tokushoho" className="transition hover:text-slate-800">
                特定商取引法に基づく表記
              </a>
            </div>
            <p className="mt-2 text-slate-400">© PreMeet</p>
          </footer>
        </div>
      </body>
    </html>
  );
}
