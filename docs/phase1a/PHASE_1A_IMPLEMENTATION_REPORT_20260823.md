# OZ COMMAND CENTER Phase 1A 実装報告

日付: 2026-08-23  
最上位仕様: `docs/OZ_COMMAND_CENTER_開発仕様書_v2.0_20260823.md`

## 結論

Phase 1Aの安全な基盤をローカルソースへ実装した。Supabase PostgreSQL/Authをdevelopmentの第一候補とし、既存Sitesと本番D1は変更していない。Sitesへのversion保存・公開・deploy、Supabase remote project作成、remote migration、Google OAuth/Sentryの実設定、Secret登録、外部送信、Calendar書き込み、D1正式移行は未実施である。

ローカルWeb画面は起動し、既存のPC 3カラム、配色、OZオーブ、PROJECT drawer、NETWORK drawer、DEMO操作を画面回帰確認した。CSS、デモ描画本体、情報密度は維持している。OZの正式音声defaultは`cedar`、一人称は全product sourceで「私」に固定した。

Supabase migrationそのものの実DB適用は、この実行環境にDocker/PostgreSQL runtimeがなく、development account/Secretも未作成のため実行していない。架空の値は使用せず、migration contractの静的検証まで実施した。

## 1. 変更したファイル一覧

### 変更

- `.env.example`
- `.gitignore`
- `README.md`
- `app/oz-scripts.tsx`
- `app/page.tsx`
- `db/index.ts`
- `db/schema.ts`
- `drizzle/0001_empty_stranger.sql`
- `drizzle.config.ts`
- `package.json`
- `package-lock.json`
- `packages/contracts/src/index.ts`
- `public/live-oz.js`
- `public/oz-network.js`
- `tests/phase0-governance.test.mjs`
- `tests/rendered-html.test.mjs`
- `tsconfig.json`
- `vite.config.ts`
- `worker/index.ts`
- `worker/integrations.ts`
- `worker/oz-data.ts`

### 追加

- `app/supabase-auth.tsx`
- `data/legacy-d1/schema.ts`
- `data/legacy-d1/private/.gitkeep`
- `data/legacy-d1/private/20260823-live-d1-backup.json`（Git管理外）
- `db/legacy-d1-schema.ts`
- `docs/adr/0005-supabase-development-and-owner-auth.md`
- `docs/phase1a/D1_MIGRATION_CANDIDATES_20260823.md`
- `docs/phase1a/OWNER_SETUP_DEVELOPMENT.md`
- `docs/phase1a/PHASE_1A_IMPLEMENTATION_REPORT_20260823.md`
- `packages/auth/src/owner-context.ts`
- `packages/contracts/src/schemas.ts`
- `packages/db/src/supabase-rest-repository.ts`
- `packages/domain/src/state-machines.ts`
- `packages/observability/src/safe-monitoring.ts`
- `public/fixtures/oz-demo-v1.js`
- `scripts/build-verified.mjs`
- `scripts/install-ci.mjs`
- `scripts/validate-artifact.mjs`
- `scripts/verify-migrations.mjs`
- `supabase/config.toml`
- `supabase/functions/_shared/safe-monitoring.ts`
- `supabase/functions/oz-job-dispatch/index.ts`
- `supabase/migrations/202608230001_phase1a_core.sql`
- `tests/auth-owner.test.ts`
- `tests/safe-monitoring.test.ts`
- `tests/security-contract.test.mjs`
- `tests/state-machines.test.ts`

### 削除または移動

- `public/scenarios.js` → `public/fixtures/oz-demo-v1.js`
- `scripts/install-ci.sh` → `scripts/install-ci.mjs`
- `scripts/build-verified.sh` → `scripts/build-verified.mjs`
- `scripts/validate-artifact.sh` → `scripts/validate-artifact.mjs`
- `scripts/sites-env.sh`（共通`HOME`上書きとLinux固有依存を廃止）
- `examples/d1/app/api/notes/route.ts`
- `examples/d1/db/schema.ts`

## 2. 実装したデータベーステーブル

| Table | 役割 |
|---|---|
| `projects` | owner別project正本、status、重要度、進捗計数方式 |
| `tasks` | formal task正本、5状態、parent、分類、期限、作業時間、担当・委任、実行環境 |
| `task_dependencies` | task間の依存関係、自己依存防止、重複防止 |
| `task_sources` | task根拠のsource種別・locator・excerpt |
| `review_items` | quick add、音声、chat、外部取込等の確認待ち候補 |
| `external_actions` | 外部操作案、provider、実行payload、状態、外部結果 |
| `action_approvals` | 外部操作の承認・却下、承認者、snapshot hash |
| `idempotency_keys` | scope別二重実行防止、key/request hash、結果resource |
| `audit_logs` | actor、対象、結果、approval、status差分のappend-only履歴 |

追加したenumは仕様書準拠の`project_status`、`task_status`、`review_status`、`external_action_status`、`execution_environment`等である。全timestampは`timestamptz`、owner検索indexとRLSを実装した。request-time DDLは削除した。

migrationは`pgcrypto`、`pg_cron`、`pgmq`を有効化し、durable queue `oz_jobs`とserver-onlyの`pgmq_public.send`境界を準備する。Cron scheduleは登録していない。

## 3. 認証・承認・監査・冪等性

### 認証とowner確認

1. BrowserはSupabase Google OAuth PKCEでdevelopment sessionを取得する。
2. 全`/api/*`、`/health`、`/session`はBearer token必須。
3. ServerはSupabase Authのuser endpointでtokenを検証する。
4. verified Google identityであることを確認する。
5. emailを正規化してserver-only `OZ_ALLOWED_EMAIL`と完全一致させる。
6. 旧`oz-command-center-owner`共通fallbackは削除した。
7. 正式DBアクセスはallowlist通過後のserver-only service credentialと明示owner UUIDを使う。
8. `anon`／`authenticated`には対象tableやmutation RPCの直接権限を付与しない。RLSも全tableで有効。

### 確認と承認

- quick addと`oz_create_task`は`TASK_CREATE/PENDING` reviewを作るだけで、formal `tasks`へinsertしない。
- `oz_complete_task`は`TASK_STATUS_CHANGE/PENDING` reviewを作るだけで、task statusを変更しない。
- reviewの`APPROVED`解決時だけ、同一transaction内でformal task作成または許可済み状態遷移を行う。
- `REJECTED`、`NEEDS_EDIT`を履歴付きで保持する。
- 外部操作はまず`PROPOSED`、次に`action_approvals`で承認／却下する。Phase 1Aでは承認後も外部実行しない。
- external actionは`PROPOSED → APPROVED → EXECUTING → SUCCEEDED/FAILED`を飛び越せない。

### 監査

- review作成、review解決、external action提案、external action承認を`audit_logs`へ記録する。
- `audit_logs`はtriggerと権限の両方でupdate/deleteを禁止。
- 監査のbefore/afterはstatus、resource ID等に限定し、task本文・メール本文・個人情報・tokenを入れない。

### 冪等性

- 重要mutationは16〜200文字の`Idempotency-Key`必須。
- raw keyとrequestはPostgreSQLでSHA-256 hash化し、raw値を保存しない。
- 同じkey・同じrequestは同じresourceをreplayし、同じkey・異なるrequestはconflict。
- review作成、review解決、external action提案、external action承認を対象化。

### 状態遷移

- task、review、external actionの許可遷移をTypeScriptとPostgreSQL trigger/functionの両方で定義。
- formal task status変更は承認RPC以外から実行できない。
- COMPLETED時刻はDB triggerで設定・再開時に解除。

## 4. 脆弱性対応前後

- 対応前: 合計21件（high 16、moderate 4、low 1、critical 0）。
- 対応: Next/React/Vite/Vinext/Cloudflare/Supabase等を互換範囲で固定更新し、不要な`drizzle-kit`を外した。残ったtransitive dev dependencyは互換major内の明示overrideで修正版へ固定。
- 対応後: `npm audit` 合計0件。production-onlyの`npm audit --omit=dev`も0件。
- `npm audit fix --force`は使用していない。

## 5. lint・build・test・画面回帰

- `npm run lint`: PASS
- `npm run typecheck`: PASS
- `npm run build`: PASS
- artifact validation: PASS
- `npm test`: 18/18 PASS
- `npm run db:verify`: PASS（9 table、RLS、RPC、legacy seed非投入）
- `npm run verify:phase1a`: PASS
- local Vite起動: PASS（`http://127.0.0.1:5173/`）
- 画面回帰: PASS
  - PC 3カラム
  - 既存配色・枠線・情報密度
  - OZオーブ
  - PROJECT drawer
  - NETWORK drawer
  - DEMO next/listening state
  - Browser console error/warning 0件

未実施: Supabase migrationの実PostgreSQL適用。理由はDocker/PostgreSQL runtimeとdevelopment外部設定が未準備のため。これは架空値を使用せず停止した項目である。

## 6. D1移行候補データ

Sites本番D1をread-onlyで確認し、以下を取得した。

- `oz_projects`: 1件
- `oz_tasks`: 8件
- `oz_memories`: 0件

完全backupはGit管理外の`data/legacy-d1/private/20260823-live-d1-backup.json`へ保存した。人が確認する一覧は別紙`OZ_D1_移行候補データ_20260823.md`に書き出した。PostgreSQLへの正式投入、owner UUID変換、D1変更・削除はいずれも未実施。

旧migrationに直接入っていた実在人物名、業務task、Drive・Slack・Chatwork IDはbackup後に削除し、demo業務データは`public/fixtures/`へ分離した。

## 7. 雄一郎側で必要なaccount設定

詳細は別紙「雄一郎側セットアップ手順」を参照。必要な操作は次の順番である。

1. development専用Supabase projectをTokyo `ap-northeast-1`で作成。
2. development専用Google Cloud project/OAuth Web clientを作成。
3. OAuth consentをTestingにし、Test userをowner 1名だけ登録。
4. localとdevelopment Supabase callbackをGoogleへ登録。
5. Supabase Google providerを有効化。
6. Git管理外のdevelopment env/Secretへ`OZ_ALLOWED_EMAIL`、Supabase URL/publishable credential/server credentialを登録。
7. Docker runtimeでlocal Supabase migrationを検証。
8. development専用Sentry projectを作り、PII送信を無効化。
9. remote migration、Edge deploy、Sites Secret登録は別途明示承認後に一つずつ実施。

Secret実値は本報告にも書いていない。

## 8. Phase 1B前に確認が必要な事項

1. development Supabase projectを作成してよいか。作成時regionはTokyoで確定。
2. developmentで使うapp originとGoogle OAuth redirect URIの最終値。
3. Google OAuth consentのTesting userがowner 1名だけであること。
4. local Docker migrationが成功した後、development remote DBへmigrationを適用してよいか。
5. Sentry development projectを作成し、実送信を有効化する時期。
6. `oz_jobs`を消費する外部workerの候補platformと、SHORT/LONGの判定基準。
7. Cron scheduleはPhase 1Bでまだ登録しないか、developmentだけで無通知dry-runを始めるか。
8. D1の1 project／8 tasksを一件ずつ正式移行するか、引き続き比較専用にするか。
9. demo fixtureの各project名を今後も画面demoとして保持するか、匿名fixtureへ差し替えるか。
10. development検証後、既存SitesへSecretを登録するか。version保存・deployは別承認。
11. formal project/taskの初期登録内容。D1行は自動採用しない。
12. Edge Functionをdevelopmentへdeployする前に、Sentry redactionとQueue権限の実環境testを行うこと。

## 非実施事項の確認

- Sites version保存・公開・deploy: 未実施
- 本番D1変更・削除: 未実施
- 本番PostgreSQL投入: 未実施
- 外部メール／message送信: 未実施
- Google Calendar書き込み: 未実施
- Secret値の出力: 未実施

