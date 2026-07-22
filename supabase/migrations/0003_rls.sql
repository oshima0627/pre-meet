-- ============================================================
-- 0003 RLS ポリシー（docs/03）
--   RLS必須（CLAUDE.md）。書き込みは service_role / RPC 経由のみに限定する。
--   SUPABASE_SERVICE_ROLE_KEY は RLS をバイパスするため、クライアントに出さない。
-- ============================================================

alter table profiles          enable row level security;
alter table research_reports  enable row level security;
alter table credit_ledger     enable row level security;
alter table payments          enable row level security;

-- 自分のプロフィールのみ
create policy "own profile" on profiles
  for all using (auth.uid() = id);

-- レポート：自分のもの、または公開されているもの
create policy "read own or public report" on research_reports
  for select using (
    auth.uid() = user_id or is_public = true
  );

-- クレジット台帳は閲覧のみ。書き込みは service_role / RPC 経由のみ
create policy "read own ledger" on credit_ledger
  for select using (auth.uid() = user_id);

create policy "read own payments" on payments
  for select using (auth.uid() = user_id);

-- companies は公開情報のキャッシュなので RLS 不要（読み取り公開・書き込みは service_role のみ）。
-- ただし anon key での書き込みは必ず塞ぐこと。RLS を有効化し SELECT のみ許可、
-- INSERT/UPDATE は service_role（RLSバイパス）に限定する。
alter table companies enable row level security;
create policy "read companies" on companies
  for select using (true);

-- anon_visitors / events は匿名でも書き込みが必要なため、
-- 書き込みは service_role 経由（BFF/Worker）に集約する。
-- クライアントから直接 anon key で叩かせない設計にするため、RLS は有効化しつつ
-- ポリシーを付けない（＝service_role のみ通る）。
alter table anon_visitors enable row level security;
alter table events        enable row level security;
