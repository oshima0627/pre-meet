export default function Tokushoho() {
  const Row = ({ k, v }: { k: string; v: string }) => (
    <div className="grid grid-cols-3 gap-2 border-b py-2 text-sm">
      <dt className="font-medium text-slate-600">{k}</dt>
      <dd className="col-span-2 text-slate-800">{v}</dd>
    </div>
  );
  return (
    <article>
      <h1 className="text-xl font-bold">特定商取引法に基づく表記</h1>
      <dl className="mt-4">
        <Row k="事業者名" v="（記入してください）" />
        <Row k="運営責任者" v="（記入してください）" />
        <Row k="所在地" v="（記入してください。請求があれば遅滞なく開示します）" />
        <Row k="連絡先" v="（メールアドレス等を記入してください）" />
        <Row k="販売価格" v="料金ページに表示（980円〜7,980円）" />
        <Row k="追加費用" v="なし" />
        <Row k="支払方法" v="クレジットカード（Stripe）" />
        <Row k="支払時期" v="購入手続き完了時" />
        <Row k="役務の提供時期" v="決済完了後、即時にクレジットを付与" />
        <Row k="返品・キャンセル" v="デジタルサービスのため購入後の返金は原則不可。生成失敗時はクレジットを自動返還します" />
        <Row k="クレジット有効期限" v="購入日から6ヶ月" />
      </dl>
    </article>
  );
}
