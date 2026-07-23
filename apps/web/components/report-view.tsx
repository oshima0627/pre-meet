import type { ResearchReport } from '@premeet/shared';
import { LockedSection } from './locked-section';

// 確信度の enum を日本語ラベル＋配色に変換する（UIに英語の生値を出さない）。
// 高＝緑・中＝琥珀・低＝灰で、ひと目で確度が伝わるようにする。
const CONFIDENCE: Record<string, { label: string; cls: string }> = {
  high: { label: '確度 高', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
  medium: { label: '確度 中', cls: 'bg-amber-50 text-amber-700 ring-amber-100' },
  low: { label: '確度 低', cls: 'bg-slate-100 text-slate-500 ring-slate-200' },
};

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
        <span className="h-4 w-1 rounded-full bg-gradient-to-b from-indigo-500 to-violet-500" />
        {title}
      </h2>
      {children}
    </section>
  );
}

export function ReportView({ report }: { report: ResearchReport }) {
  const f = report.facts;
  const h = report.hypothesis;

  return (
    <div className="space-y-5">
      {/* 免責（docs/07：常時表示） */}
      <p className="flex gap-2 rounded-xl border border-amber-200/70 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
        <span aria-hidden className="shrink-0">
          ⚠️
        </span>
        <span>
          本レポートは公開情報をもとにAIが自動生成したものであり、事実と異なる内容を含む可能性があります。
          特に「想定課題」「想定反論」等の推測部分は実際と一致することを保証しません。ご利用に際しては必ずご自身でご確認ください。
        </span>
      </p>

      {f && (
        <>
          {/* 1. 企業サマリー */}
          <Card title="企業サマリー">
            <p className="text-sm text-slate-700">{f.summary}</p>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600">
              {f.basicInfo.founded && <div>設立: {f.basicInfo.founded}</div>}
              {f.basicInfo.employees && <div>従業員: {f.basicInfo.employees}</div>}
              {f.basicInfo.capital && <div>資本金: {f.basicInfo.capital}</div>}
              {f.basicInfo.representative && <div>代表: {f.basicInfo.representative}</div>}
            </dl>
          </Card>

          {/* 2. 提供サービス・主要顧客 */}
          <Card title="提供サービス・主要顧客">
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
              {f.services.map((s, i) => (
                <li key={i}>
                  <span className="font-medium">{s.name}</span>：{s.description}
                </li>
              ))}
            </ul>
            {f.customers.namedClients.length > 0 && (
              <p className="mt-2 text-xs text-slate-600">
                導入事例: {f.customers.namedClients.join('、')}
              </p>
            )}
          </Card>

          {/* 3. 直近の動き */}
          <Card title="直近の動き（ニュース・リリース）">
            {f.recentNews.length > 0 ? (
              <ul className="space-y-1 text-sm text-slate-700">
                {f.recentNews.map((n, i) => (
                  <li key={i}>
                    <span className="text-xs text-slate-500">{n.date ?? ''}</span> {n.title}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">目立った直近の動きは取得できませんでした。</p>
            )}
          </Card>

          {/* 4. 採用状況から見た注力領域 */}
          <Card title="採用状況から見た注力領域">
            {f.hiring.openPositions.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                {f.hiring.openPositions.map((p, i) => (
                  <li key={i}>
                    {p.title}
                    {p.department ? `（${p.department}）` : ''}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">公開求人は取得できませんでした。</p>
            )}
          </Card>
        </>
      )}

      {/* 5-8. 仮説（有料）。無ければぼかし表示で課金導線 */}
      {h ? (
        <>
          <Card title="想定課題 仮説">
            <ul className="space-y-3">
              {h.hypotheses.map((x, i) => {
                const c = CONFIDENCE[x.confidence];
                return (
                  <li
                    key={i}
                    className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                          c?.cls ?? 'bg-slate-100 text-slate-500 ring-slate-200'
                        }`}
                      >
                        {c?.label ?? x.confidence}
                      </span>
                      <span className="font-semibold text-slate-900">
                        {x.title}
                      </span>
                    </div>
                    <p className="mt-1.5 text-slate-700">{x.detail}</p>
                    <p className="mt-1 text-xs text-slate-500">根拠: {x.evidence}</p>
                  </li>
                );
              })}
            </ul>
          </Card>
          <Card title="刺さる切り口">
            <ul className="space-y-3 text-sm">
              {h.angles.map((a, i) => (
                <li
                  key={i}
                  className="rounded-xl border border-slate-100 bg-slate-50/50 p-3"
                >
                  <span className="font-semibold text-slate-900">{a.title}</span>
                  <p className="mt-1 text-slate-700">「{a.opening}」</p>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="ヒアリング質問">
            <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
              {h.questions.map((q, i) => (
                <li key={i}>{q.question}</li>
              ))}
            </ol>
          </Card>
          <Card title="想定反論と返し">
            <ul className="space-y-2 text-sm">
              {h.objections.map((o, i) => (
                <li key={i}>
                  <p className="font-medium">「{o.objection}」</p>
                  <p className="text-slate-700">→ {o.response}</p>
                </li>
              ))}
            </ul>
          </Card>
        </>
      ) : (
        <>
          <LockedSection title="想定課題 仮説 3つ（根拠付き）" />
          <LockedSection title="刺さる切り口 3案 / ヒアリング質問 10問 / 想定反論 5組" />
        </>
      )}

      {report.sourceUrls.length > 0 && (
        <p className="break-all px-1 text-xs text-slate-400">
          <span className="font-medium text-slate-500">収集元:</span>{' '}
          {report.sourceUrls.slice(0, 8).join(' / ')}
        </p>
      )}
    </div>
  );
}
