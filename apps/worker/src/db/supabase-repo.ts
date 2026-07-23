import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { FactsSchema, HypothesisSchema, type ResearchReport } from '@premeet/shared';
import { isCacheFresh, type CachedCompany, type ReportRepo } from './repo.js';

// Supabase を使った ReportRepo 実装。書き込みはサービスロール（RLSバイパス）で行う。
// SUPABASE_SERVICE_ROLE_KEY はサーバー側のみ。クライアントに絶対に出さない（CLAUDE.md）。
export function createSupabaseRepo(
  url: string,
  serviceRoleKey: string,
): ReportRepo {
  const db: SupabaseClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });

  return {
    async getFreshCompany(domain, ttlDays) {
      const { data, error } = await db
        .from('companies')
        .select('name, facts, facts_generated_at, source_urls')
        .eq('domain', domain)
        .maybeSingle();
      if (error || !data) return null;

      // 期限切れ・facts 未生成はキャッシュなし扱い
      if (!isCacheFresh(data.facts_generated_at, ttlDays, Date.now())) return null;

      // DB の jsonb を鵜呑みにせず、必ずスキーマ検証してから返す（型安全＝Facts）
      const parsed = FactsSchema.safeParse(data.facts);
      if (!parsed.success) return null;

      const cached: CachedCompany = {
        name: data.name ?? null,
        facts: parsed.data,
        sourceUrls: (data.source_urls as string[] | null) ?? [],
      };
      return cached;
    },

    async saveCompanyFacts({ domain, name, facts, sourceUrls, crawlBlocked }) {
      const now = new Date().toISOString();
      const { error } = await db.from('companies').upsert(
        {
          domain,
          name,
          facts,
          facts_generated_at: now,
          source_urls: sourceUrls,
          crawl_blocked: crawlBlocked ?? false,
          updated_at: now,
        },
        { onConflict: 'domain' },
      );
      if (error) {
        // キャッシュ保存失敗は致命ではない（次回また生成すればよい）。呼び出し側で握る
        throw new Error(`companies upsert 失敗: ${error.message}`);
      }
    },

    async ensureCompany(domain, name) {
      // 既存を探し、無ければ作成して company_id を返す
      const found = await db
        .from('companies')
        .select('id')
        .eq('domain', domain)
        .maybeSingle();
      if (found.data?.id) return found.data.id as string;

      const inserted = await db
        .from('companies')
        .insert({ domain, name })
        .select('id')
        .single();
      if (inserted.error || !inserted.data) {
        // 競合で同時挿入された場合を考慮して再取得
        const retry = await db
          .from('companies')
          .select('id')
          .eq('domain', domain)
          .maybeSingle();
        if (retry.data?.id) return retry.data.id as string;
        throw new Error(`companies 確保に失敗: ${inserted.error?.message}`);
      }
      return inserted.data.id as string;
    },

    async getRecentDoneReport(domain, tier, ttlDays) {
      // ドメイン→company_id→直近doneレポート。自社情報つきは呼び出し側で除外済み。
      const company = await db
        .from('companies')
        .select('id, name')
        .eq('domain', domain)
        .maybeSingle();
      if (!company.data?.id) return null;

      const { data, error } = await db
        .from('research_reports')
        .select(
          'slug, tier, status, facts, hypothesis, own_context, is_public, created_at, completed_at',
        )
        .eq('company_id', company.data.id)
        .eq('tier', tier)
        .eq('status', 'done')
        .is('own_context', null) // 自社情報つきはキャッシュ対象外
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error || !data) return null;
      if (!isCacheFresh(data.completed_at, ttlDays, Date.now())) return null;

      // jsonb は必ず検証してから型にのせる
      const facts = FactsSchema.safeParse(data.facts);
      const hyp = data.hypothesis
        ? HypothesisSchema.safeParse(data.hypothesis)
        : null;

      const report: ResearchReport = {
        slug: data.slug,
        tier: data.tier,
        status: 'done',
        errorCode: null,
        company: { name: company.data.name ?? null, domain },
        facts: facts.success ? facts.data : null,
        hypothesis: hyp && hyp.success ? hyp.data : null,
        ownContext: null,
        sourceUrls: [],
        isPublic: data.is_public ?? false,
        createdAt: data.created_at,
        completedAt: data.completed_at,
      };
      return report;
    },

    async createReport(input) {
      // research_reports.anon_id は anon_visitors への FK。Cookie 由来の匿名IDは
      // 初回リクエストでまだ未登録なので、レポート作成前に訪問者行を確保する。
      // （重複時は何もしない＝first_seen_at を上書きしない）
      if (input.anonId) {
        const { error: visitorError } = await db
          .from('anon_visitors')
          .upsert({ id: input.anonId }, { onConflict: 'id', ignoreDuplicates: true });
        if (visitorError) {
          throw new Error(`anon_visitors 確保に失敗: ${visitorError.message}`);
        }
      }

      const { data, error } = await db
        .from('research_reports')
        .insert({
          slug: input.slug,
          company_id: input.companyId,
          tier: input.tier,
          user_id: input.userId,
          anon_id: input.anonId,
          own_context: input.ownContext,
          status: 'queued',
        })
        .select('id')
        .single();
      if (error || !data) {
        throw new Error(`research_reports 作成に失敗: ${error?.message}`);
      }
      return data.id as string;
    },

    async completeReport(reportId, result, ownContext) {
      const { error } = await db
        .from('research_reports')
        .update({
          status: 'done',
          facts: result.facts,
          hypothesis: result.hypothesis,
          // 自社URLから解決した実際の自社文脈で上書き（createReport 時点は生の入力）
          own_context: ownContext,
          model_stage1: result.usage.stage1.model,
          model_stage2: result.usage.stage2?.model ?? null,
          input_tokens:
            result.usage.stage1.inputTokens +
            (result.usage.stage2?.inputTokens ?? 0),
          output_tokens:
            result.usage.stage1.outputTokens +
            (result.usage.stage2?.outputTokens ?? 0),
          cost_usd: result.usage.totalCostUsd,
          duration_ms: result.durationMs,
          completed_at: new Date().toISOString(),
        })
        .eq('id', reportId);
      if (error) throw new Error(`research_reports 完了更新に失敗: ${error.message}`);
    },

    async failReport(reportId, errorCode) {
      await db
        .from('research_reports')
        .update({ status: 'failed', error_code: errorCode })
        .eq('id', reportId);
    },

    async getReportBySlug(slug, viewer) {
      const { data, error } = await db
        .from('research_reports')
        .select(
          'slug, tier, status, error_code, facts, hypothesis, own_context, is_public, user_id, anon_id, created_at, completed_at, companies(name, domain, source_urls)',
        )
        .eq('slug', slug)
        .maybeSingle();
      if (error || !data) return null;

      // アクセス制御：この取得はサービスロール（RLSバイパス）なので、ここで
      // 明示的に「公開 or 所有者本人」だけに絞る。これが無いとスラッグを知る
      // /当てた第三者に有料仮説・own_context（依頼主の営業情報）まで漏れる。
      const isPublic = data.is_public === true;
      const ownedByUser =
        viewer?.userId != null && viewer.userId === data.user_id;
      const ownedByAnon =
        viewer?.anonId != null && viewer.anonId === data.anon_id;
      if (!isPublic && !ownedByUser && !ownedByAnon) return null;

      const facts = data.facts ? FactsSchema.safeParse(data.facts) : null;
      const hyp = data.hypothesis
        ? HypothesisSchema.safeParse(data.hypothesis)
        : null;
      // companies は 1:1 だが Supabase の型上は配列になり得るので吸収する
      const company = (
        Array.isArray(data.companies) ? data.companies[0] : data.companies
      ) as { name: string | null; domain: string; source_urls: string[] | null } | null;

      const report: ResearchReport = {
        slug: data.slug,
        tier: data.tier,
        status: data.status,
        errorCode: data.error_code ?? null,
        company: { name: company?.name ?? null, domain: company?.domain ?? '' },
        facts: facts && facts.success ? facts.data : null,
        hypothesis: hyp && hyp.success ? hyp.data : null,
        ownContext: (data.own_context as ResearchReport['ownContext']) ?? null,
        sourceUrls: company?.source_urls ?? [],
        isPublic: data.is_public ?? false,
        createdAt: data.created_at,
        completedAt: data.completed_at,
      };
      return report;
    },

    async reconcileStaleReports({ userId, anonId, staleBeforeIso }) {
      if (!userId && !anonId) return 0;

      // 自分の・未完了(queued/collecting/generating)・staleBeforeIso より前の行を拾う
      const inProgress = ['queued', 'collecting', 'generating'];
      let q = db
        .from('research_reports')
        .select('id, tier, user_id')
        .in('status', inProgress)
        .lt('created_at', staleBeforeIso);
      q = userId
        ? q.eq('user_id', userId)
        : q.eq('anon_id', anonId as string);
      const { data, error } = await q;
      if (error || !data || data.length === 0) return 0;

      let fixed = 0;
      for (const r of data) {
        // 失敗マーク。競合で done になっていたら触らない（in-progress の時だけ更新）
        const { error: upErr } = await db
          .from('research_reports')
          .update({ status: 'failed', error_code: 'AI_FAILED' })
          .eq('id', r.id)
          .in('status', inProgress);
        if (upErr) continue;
        // 有料はクレジット返還（refund_credit は report 単位で冪等）
        if (r.tier === 'paid' && r.user_id) {
          await db.rpc('refund_credit', {
            p_user_id: r.user_id,
            p_report_id: r.id,
            p_amount: 1,
          });
        }
        fixed++;
      }
      return fixed;
    },

    async listReports({ userId, anonId, limit = 30 }) {
      // 所有者が特定できない場合は空配列（他人のレポートを混ぜない）
      if (!userId && !anonId) return [];

      let query = db
        .from('research_reports')
        .select(
          'slug, tier, status, created_at, completed_at, companies(name, domain)',
        )
        // 生成失敗は一覧に出さない（正常完了＋生成中のみ表示する）
        .neq('status', 'failed')
        .order('created_at', { ascending: false })
        .limit(limit);
      // ログイン済みは user_id、匿名は anon_id で絞る（マージ後はログイン側に寄る）
      query = userId
        ? query.eq('user_id', userId)
        : query.eq('anon_id', anonId as string);

      const { data, error } = await query;
      if (error || !data) return [];

      // 生成中(queued/collecting/generating)はタイムアウト等で途中終了すると
      // 行が残り続ける（catch に到達できず failed にできない）。一定時間を超えた
      // 「止まったままの生成中」は表示しない（＝実質失敗として一覧から隠す）。
      const STALE_MS = 10 * 60 * 1000; // 10分。生成は通常これより十分短い
      const staleBefore = Date.now() - STALE_MS;

      return data
        .filter((r) => {
          if (r.status === 'done') return true;
          return new Date(r.created_at).getTime() >= staleBefore;
        })
        .map((r) => {
        // companies は 1:1 だが型上は配列になり得るので吸収する
        const company = (
          Array.isArray(r.companies) ? r.companies[0] : r.companies
        ) as { name: string | null; domain: string } | null;
        return {
          slug: r.slug,
          tier: r.tier,
          status: r.status,
          companyName: company?.name ?? null,
          companyDomain: company?.domain ?? null,
          createdAt: r.created_at,
          completedAt: r.completed_at,
        };
      });
    },

    async consumeCredit(userId, reportId, amount) {
      const { data, error } = await db.rpc('consume_credit', {
        p_user_id: userId,
        p_report_id: reportId,
        p_amount: amount,
      });
      if (error) throw new Error(`consume_credit 失敗: ${error.message}`);
      return data === true;
    },

    async refundCredit(userId, reportId, amount) {
      const { data, error } = await db.rpc('refund_credit', {
        p_user_id: userId,
        p_report_id: reportId,
        p_amount: amount,
      });
      if (error) throw new Error(`refund_credit 失敗: ${error.message}`);
      return data === true;
    },

    async mergeAnonToUser(anonId, userId) {
      const { error } = await db.rpc('merge_anon_to_user', {
        p_anon_id: anonId,
        p_user_id: userId,
      });
      if (error) throw new Error(`merge_anon_to_user 失敗: ${error.message}`);
    },

    async logEvent({ name, anonId, userId, props }) {
      // 計測失敗で本流を止めない（呼び出し側で握りつぶす想定）
      await db
        .from('events')
        .insert({ name, anon_id: anonId, user_id: userId, props: props ?? {} });
    },
  };
}
