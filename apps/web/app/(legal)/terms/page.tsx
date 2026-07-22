export default function Terms() {
  return (
    <article className="prose prose-sm max-w-none">
      <h1 className="text-xl font-bold">利用規約</h1>
      <p className="mt-4 text-sm text-slate-700">
        本サービス「PreMeet」（以下「本サービス」）の利用条件を定めます。
      </p>
      <h2 className="mt-6 font-semibold">生成結果について</h2>
      <p className="text-sm text-slate-700">
        本サービスの生成物は公開情報をもとにAIが自動生成したものであり、事実と異なる内容を含む可能性があります。
        特に「想定課題」「想定反論」等の推測部分は、実際の状況と一致することを保証しません。ご利用者ご自身で内容をご確認ください。
      </p>
      <h2 className="mt-6 font-semibold">禁止事項</h2>
      <ul className="list-disc pl-5 text-sm text-slate-700">
        <li>法令または公序良俗に違反する利用</li>
        <li>第三者の権利を侵害する利用</li>
        <li>本サービスの運営を妨害する行為</li>
      </ul>
      <h2 className="mt-6 font-semibold">クレジット</h2>
      <p className="text-sm text-slate-700">
        クレジットは買い切り制で、有効期限は購入日から6ヶ月です。返金は原則行いません（生成失敗時は自動で返還します）。
      </p>
      <h2 className="mt-6 font-semibold">削除要請</h2>
      <p className="text-sm text-slate-700">
        掲載企業からの削除要請は問い合わせ窓口で受け付け、該当キャッシュを削除します。
      </p>
    </article>
  );
}
