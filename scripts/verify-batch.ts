#!/usr/bin/env -S npx tsx
// ============================================================
// Phase 0：10社一括検証 + 採点シート生成（docs/05・docs/08）
//   使い方:
//     npm run verify:batch                       # scripts/companies.txt を読む
//     npm run verify:batch -- --file mylist.txt --tier paid
//   companies.txt の各行:  <URL または name:企業名> | 業種ラベル
//   （# で始まる行はコメント。空行は無視）
//
//   出力:
//     out/<domain>.json      各社の生成結果
//     out/_summary.json      集計（原価・スコア・件数）
//     out/_scoresheet.md     手採点用シート（docs/05 の検証項目つき）
// ============================================================
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  runResearch,
  loadConfig,
  loadDotenv,
  toErrorResponse,
  type ResearchInput,
  type ResearchResult,
} from '@premeet/worker';
import { slugify, fmtUsd, pad } from './util.js';

// docs/01 非機能要件 / docs/08 合格基準
const COST_CAP_USD = 0.15;
const PHASE0_COST_TARGET_USD = 0.1;

interface Entry {
  target: string;
  inputType: 'url' | 'name';
  label: string;
}

interface Outcome {
  label: string;
  target: string;
  ok: boolean;
  errorCode?: string;
  result?: ResearchResult;
}

function parseListFile(path: string): Entry[] {
  const raw = readFileSync(path, 'utf8');
  const entries: Entry[] = [];
  for (const line of raw.split('\n')) {
    const stripped = line.replace(/#.*$/, '').trim();
    if (!stripped) continue;
    // "TARGET | ラベル" の形式。| が無ければラベルなし
    const bar = stripped.indexOf('|');
    const targetRaw = (bar === -1 ? stripped : stripped.slice(0, bar)).trim();
    const label = (bar === -1 ? '' : stripped.slice(bar + 1)).trim();
    if (!targetRaw) continue;

    if (targetRaw.startsWith('name:')) {
      entries.push({
        target: targetRaw.slice('name:'.length).trim(),
        inputType: 'name',
        label,
      });
    } else {
      entries.push({ target: targetRaw, inputType: 'url', label });
    }
  }
  return entries;
}

function parseArgs(argv: string[]): { file: string; tier: 'free' | 'paid'; outDir: string } {
  const rest = argv.slice(2);
  let file = 'scripts/companies.txt';
  let tier: 'free' | 'paid' = 'paid';
  let outDir = './out';
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--file') file = rest[++i] ?? file;
    else if (a === '--tier') {
      const v = rest[++i];
      if (v === 'free' || v === 'paid') tier = v;
    } else if (a === '--out') outDir = rest[++i] ?? outDir;
  }
  return { file, tier, outDir };
}

// 採点シート（Markdown）を生成する。docs/05 の検証表をチェックボックスで並べ、
// 判定に必要な出力（要約・仮説・evidence・切り口）をインラインに出す。
function buildScoreSheet(outcomes: Outcome[]): string {
  const lines: string[] = [];
  lines.push('# Phase 0 採点シート');
  lines.push('');
  lines.push('> docs/05 の検証表に沿って各社を手採点する。**「汎用性の排除」が最重要**。');
  lines.push('> 業種の異なる10社（IT/製造/小売/建設/医療/士業/飲食/物流/不動産/教育）で実施する。');
  lines.push('');
  lines.push('## 合格基準（docs/08）');
  lines.push('- [ ] 事実の混入エラー：10社中 **0件**');
  lines.push('- [ ] 妥当な課題仮説：10社中 **7社**で「2件以上」が妥当');
  lines.push('- [ ] 汎用出力（どの企業にも当てはまる内容）：10社中 **2社以下**');
  lines.push('- [ ] 情報が薄い企業で無理に生成せず THIN_CONTENT で止まる');
  lines.push('- [ ] 1件あたり原価：**$0.10以下**');
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const o of outcomes) {
    const title = o.label ? `${o.label}：${o.target}` : o.target;
    lines.push(`## ${title}`);
    if (!o.ok || !o.result) {
      lines.push('');
      lines.push(`**結果: 失敗 [${o.errorCode}]**（採点対象外。THIN_CONTENT/ROBOTS等は仕様どおりの停止か確認）`);
      lines.push('');
      lines.push('---');
      lines.push('');
      continue;
    }
    const r = o.result;
    const f = r.facts;
    lines.push('');
    lines.push(`- ドメイン: \`${r.domain}\` / 収集ページ: ${r.pages.length} / 原価: ${fmtUsd(r.usage.totalCostUsd)} / dataQuality: ${f.dataQuality.score}`);
    lines.push('');
    lines.push('**企業サマリー（Stage1）**');
    lines.push('');
    lines.push(`> ${f.summary}`);
    lines.push('');

    if (r.thinContent) {
      lines.push('**仮説: THIN_CONTENT のため未生成（score < 0.3）** — 薄い企業で止まる挙動の確認対象');
    } else if (r.hypothesis) {
      lines.push('**想定課題 仮説（根拠つき）**');
      lines.push('');
      for (const h of r.hypothesis.hypotheses) {
        lines.push(`- (${h.confidence}) **${h.title}** — ${h.detail}`);
        lines.push(`  - 根拠: ${h.evidence}`);
      }
      lines.push('');
      lines.push('**刺さる切り口（openingの読み上げ確認）**');
      lines.push('');
      for (const a of r.hypothesis.angles) {
        lines.push(`- **${a.title}**: 「${a.opening}」`);
      }
      lines.push('');
    } else {
      lines.push('**仮説: 未生成（tier=free）**');
    }

    lines.push('');
    lines.push('**採点（docs/05）**');
    lines.push('- [ ] 事実の正確性：サイトに無い記述が混入していない');
    lines.push('- [ ] 課題仮説の妥当性：3件中2件以上が「言われてみればそうだ」');
    lines.push('- [ ] evidence の追跡性：全仮説の根拠が facts 内に実在する');
    lines.push('- [ ] 切り口の実用性：opening をそのまま読んでも不自然でない');
    lines.push('- [ ] 汎用性の排除：どの企業にも当てはまる出力になっていない ★最重要');
    lines.push('');
    lines.push('---');
    lines.push('');
  }
  return lines.join('\n');
}

async function main(): Promise<void> {
  loadDotenv(resolve(process.cwd(), '.env'));
  const config = loadConfig();
  const { file, tier, outDir } = parseArgs(process.argv);

  const entries = parseListFile(resolve(process.cwd(), file));
  if (entries.length === 0) {
    console.error(`対象がありません: ${file}（companies.example.txt を参考に作成してください）`);
    process.exit(2);
  }

  mkdirSync(outDir, { recursive: true });
  console.error(`\n▶ 一括検証: ${entries.length}社  (tier=${tier})\n`);

  const outcomes: Outcome[] = [];
  for (const [i, e] of entries.entries()) {
    const head = `[${i + 1}/${entries.length}] ${e.label || e.target}`;
    console.error(`— ${head}`);
    const req: ResearchInput = { input: e.target, inputType: e.inputType, tier };
    try {
      const result = await runResearch(req, config, (step, msg) =>
        console.error(`    · [${step}] ${msg}`),
      );
      writeFileSync(
        resolve(outDir, `${slugify(result.domain)}.json`),
        JSON.stringify(result, null, 2),
        'utf8',
      );
      outcomes.push({ label: e.label, target: e.target, ok: true, result });
      console.error(
        `    ✓ score=${result.facts.dataQuality.score} cost=${fmtUsd(result.usage.totalCostUsd)} pages=${result.pages.length}`,
      );
    } catch (err) {
      const { error } = toErrorResponse(err);
      outcomes.push({ label: e.label, target: e.target, ok: false, errorCode: error.code });
      console.error(`    ✗ [${error.code}] ${error.message}`);
    }
  }

  // --- 集計表 ---
  console.error('\n===== 集計 =====');
  console.error(`${pad('業種/対象', 22)} ${pad('score', 6, 'r')} ${pad('仮説', 5, 'r')} ${pad('原価', 9, 'r')} 状態`);
  const succeeded = outcomes.filter((o) => o.ok && o.result);
  let totalCost = 0;
  let withinTarget = 0;
  for (const o of outcomes) {
    if (o.ok && o.result) {
      const r = o.result;
      totalCost += r.usage.totalCostUsd;
      if (r.usage.totalCostUsd <= PHASE0_COST_TARGET_USD) withinTarget++;
      const overCap = r.usage.totalCostUsd > COST_CAP_USD ? ' ❌上限超' : r.usage.totalCostUsd > PHASE0_COST_TARGET_USD ? ' △' : ' ✅';
      console.error(
        `${pad(o.label || o.target, 22)} ${pad(r.facts.dataQuality.score, 6, 'r')} ${pad(r.thinContent ? '-' : (r.hypothesis?.hypotheses.length ?? 0), 5, 'r')} ${pad(fmtUsd(r.usage.totalCostUsd), 9, 'r')}${overCap}`,
      );
    } else {
      console.error(`${pad(o.label || o.target, 22)} ${pad('-', 6, 'r')} ${pad('-', 5, 'r')} ${pad('-', 9, 'r')} ✗ ${o.errorCode}`);
    }
  }
  const n = succeeded.length;
  const avg = n > 0 ? totalCost / n : 0;
  console.error('');
  console.error(`成功: ${n}/${outcomes.length}社  合計原価: ${fmtUsd(totalCost)}  平均: ${fmtUsd(avg)}`);
  console.error(`原価目標($0.10)以内: ${withinTarget}/${n}社`);

  // --- 集計JSON + 採点シート ---
  const summary = {
    tier,
    count: outcomes.length,
    succeeded: n,
    totalCostUsd: totalCost,
    avgCostUsd: avg,
    withinCostTarget: withinTarget,
    items: outcomes.map((o) => ({
      label: o.label,
      target: o.target,
      ok: o.ok,
      errorCode: o.errorCode,
      domain: o.result?.domain,
      score: o.result?.facts.dataQuality.score,
      thinContent: o.result?.thinContent,
      hypotheses: o.result?.hypothesis?.hypotheses.length ?? null,
      costUsd: o.result?.usage.totalCostUsd,
    })),
  };
  writeFileSync(resolve(outDir, '_summary.json'), JSON.stringify(summary, null, 2), 'utf8');
  writeFileSync(resolve(outDir, '_scoresheet.md'), buildScoreSheet(outcomes), 'utf8');
  console.error(`\n📄 out/_summary.json / out/_scoresheet.md を出力しました`);
}

main().catch((err) => {
  const { error } = toErrorResponse(err);
  console.error(`\n✗ バッチ失敗: [${error.code}] ${error.message}`);
  if (error.code === 'UNKNOWN') console.error(err);
  process.exit(1);
});
