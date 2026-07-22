export default function Privacy() {
  return (
    <article className="prose prose-sm max-w-none">
      <h1 className="text-xl font-bold">プライバシーポリシー</h1>
      <p className="mt-4 text-sm text-slate-700">
        本サービスは、企業単位の公開情報のみを扱い、商談相手個人の氏名・役職・名刺情報などの個人情報を収集・生成・保存しません。
      </p>
      <h2 className="mt-6 font-semibold">取得する情報</h2>
      <ul className="list-disc pl-5 text-sm text-slate-700">
        <li>入力されたURL・企業名、生成結果</li>
        <li>利用状況の計測データ（匿名ID・イベント）</li>
        <li>決済に関する情報（Stripe 経由。カード情報は当社では保持しません）</li>
      </ul>
      <h2 className="mt-6 font-semibold">利用目的</h2>
      <p className="text-sm text-slate-700">サービス提供・品質改善・不正利用の防止のために利用します。</p>
    </article>
  );
}
