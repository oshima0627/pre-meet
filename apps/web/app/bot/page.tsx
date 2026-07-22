export default function Bot() {
  return (
    <article className="prose prose-sm max-w-none">
      <h1 className="text-xl font-bold">PreMeetBot について</h1>
      <p className="mt-4 text-sm text-slate-700">
        PreMeet は企業の公開Webサイトから公開情報を収集します。クロールは以下の方針で行います。
      </p>
      <ul className="list-disc pl-5 text-sm text-slate-700">
        <li>User-Agent: <code>PreMeetBot/1.0 (+https://premeet.jp/bot)</code></li>
        <li><code>robots.txt</code> を尊重し、Disallow のパスは取得しません</li>
        <li>同一ドメインへのアクセスは1秒に1回まで</li>
        <li>取得ページ数の上限を設けています</li>
        <li>取得したHTMLの原文は再配布せず、要約・構造化データのみ保持します</li>
      </ul>
      <p className="mt-4 text-sm text-slate-700">
        掲載の停止をご希望の場合は問い合わせ窓口までご連絡ください。
      </p>
    </article>
  );
}
