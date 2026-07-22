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
        <div className="mx-auto max-w-3xl px-4 py-6">
          <SiteHeader />
          {children}
          <footer className="mt-16 border-t pt-6 text-xs text-slate-500">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <a href="/terms" className="hover:underline">利用規約</a>
              <a href="/privacy" className="hover:underline">プライバシーポリシー</a>
              <a href="/tokushoho" className="hover:underline">特定商取引法に基づく表記</a>
            </div>
            <p className="mt-2">© PreMeet</p>
          </footer>
        </div>
      </body>
    </html>
  );
}
