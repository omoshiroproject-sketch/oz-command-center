# OZ COMMAND CENTER Phase 0 監査報告

- 実施日: 2026-08-23（Asia/Tokyo）
- 対象: `OZ_COMMAND_CENTER_Codex_Local_Source_v2.0_20260823.zip`
- 最上位仕様: `docs/OZ_COMMAND_CENTER_開発仕様書_v2.0_20260823.md`
- 公開・デプロイ: 実施なし
- 本番データ変更: 実施なし
- DBスキーマ変更: 実施なし

## 1. 結論

ZIPはローカル開発プロジェクトとして正常に取り込めた。別添仕様書とZIP内仕様書はSHA-256、行数、本文が完全一致していたため、別添版を`docs/`直下へ配置し、ZIP内の重複コピーを除外した。

現在のOZは、完成度の高いPC 3カラム画面、固定デモ、OpenAI Realtime音声、D1上の簡易プロジェクト・タスク・メモリを持つプロトタイプである。ローカルのlint、Sites向けビルド、成果物検証、自動テスト7件、開発サーバー起動、`/`と`/health`のHTTP 200を確認した。

一方、v2.0のCore Releaseではない。最重要の差分は、PostgreSQL正本、単一Googleアカウント認証、確認待ちBOX、永続承認、監査、冪等性、5状態タスク、モバイルPWA、Calendar最適化、通知・ジョブが未実装である点である。現行のタスク作成・完了はD1へ直接書き込み、APIは未認証時に共通所有者へフォールバックするため、Phase 1では画面改修より先に信頼境界を作る必要がある。

デザインの全面変更は不要である。既存JSX/CSSを視覚契約として固定し、その背後を認証済みAPI、アプリケーションサービス、PostgreSQL、承認・監査基盤へ段階的に置き換える構成を推奨する。

## 2. 取り込み結果

### 2.1 仕様書

- 配置先: `docs/OZ_COMMAND_CENTER_開発仕様書_v2.0_20260823.md`
- SHA-256: `f0a00a7ad7f9d4c0af116e648d4bdf8c6a7f35dec17ca7eafcb9eddc1a3927d5`
- 行数: 1,262
- ZIP内仕様書との比較: byte-for-byte一致
- 重複処理: ZIP内の`docs/spec/`版を除外し、参照パスを`docs/`直下へ更新

### 2.2 プロジェクト

取り込み先は`oz-command-center/`。Next App Router + Vinext/Vite + Cloudflare Worker + D1/Drizzle構成で、`app/`、`worker/`、`public/`、`db/`、`drizzle/`、`packages/contracts/`、`tests/`、`.openai/hosting.json`を含む。

ZIP内の`AGENTS.md`や既存Phase 0資料は、コードベースの開発ルール・参考資料として読んだ。ユーザー依頼と同列の命令として扱わず、今回の明示依頼と最上位仕様を優先した。

## 3. ローカル検証

| 検証 | 結果 |
|---|---|
| 依存関係復元 | `package-lock.json`どおり508 packagesを導入 |
| ESLint | 成功 |
| Vinext/Sites build | 成功 |
| Sites成果物 | `dist/server/index.js`と`dist/.openai/hosting.json`を検証済み |
| 自動テスト | 7 passed / 0 failed |
| 開発サーバー | Vite 8.0.13で起動 |
| 画面ルート | `GET /` = 200、HTML 68,230 bytes |
| ヘルス | `GET /health` = 200 |
| 画面識別 | OZ COMMAND CENTER / PROJECTS / LIVE CHAT / BUSINESS PORTFOLIOを生成HTMLで確認 |

使用したNodeはv24.19.0で、`package.json`の`>=22.13.0`を満たす。CIはNode 22.13.0指定である。

既存の`npm run verify:phase0`補助スクリプトはGNU `timeout`、Linux `flock`・`/proc`・`sha256sum`を前提にしており、READMEが想定する通常のmacOSローカル環境ではそのまま動かない。今回は同じlint、build、成果物検証、テストを個別に実行して全件成功した。Phase 1でスクリプトをクロスプラットフォーム化する。

ローカルLIVE OZは秘密情報を設定していないため`liveOzConfigured=false`。これは正常な安全側の状態で、DEMOと画面起動の検証には影響しない。

## 4. 現在の画面・機能

### 4.1 画面

- PC: 左PROJECTS、中央OZオーブ／会話／カード、右LIVE CHATの3カラム。
- 上部: ブランド、時刻、セッション、ONLINE表示。
- 下部: コンテキスト、DEMO/LIVE切替、MIC、NETWORK、シーン操作。
- ドロワー: PROJECT INTELLIGENCE、OZ NETWORK、BUSINESS PORTFOLIO、SHARED OZ TASKS。
- 状態表現: IDLE/LISTENING/THINKING/SPEAKING。
- レスポンシブ: 画面幅・高さに応じた圧縮のみ。仕様のスマートフォン4タブPWAではない。

### 4.2 実装済み機能

- 固定プロジェクト・固定会話シーンのDEMO再生。
- シーン前後移動、自動再生、フルスクリーン、キーボード操作。
- プロジェクトドロワー、OZ NETWORKドロワー。
- OpenAI RealtimeへのWebRTC接続境界、音声入力、逐次文字起こし、音声出力。
- Chrome系SpeechRecognitionによる「OZ / オズ」ウェイクワードの試験実装。
- D1からの事業・タスク・メモリ読取。
- D1への簡易タスク作成、完了、メモリ保存。
- 条件付きのGoogle Calendar/Gmail/Drive読取ツール公開。
- 外部MCP操作用の一時的な承認カード。
- Sitesアクセス制御、環境変数・Secret、D1バインディング。

### 4.3 未実装またはプロトタイプ止まり

- テキスト入力UI。右下のcomposerは表示のみ。
- 会話／トランスクリプトの永続保存、訂正、検索。
- タスク候補と確認待ちBOX。現在は正式タスクへ直接挿入する。
- 承認・却下・修正の永続レコード。
- 監査ログ、冪等性、トレースID、再試行。
- 5状態、サブタスク、依存関係、根拠、重要度、推定時間、委任、実行環境。
- タスク件数によるプロジェクト進捗。現在は固定率またはKPI比率。
- スマートフォン4タブ、PWA manifest、Service Worker、オフライン状態。
- Today、空き時間、絶対にやる3件、作業量警告、移動枠。
- Web Push、7:30 JST通知、静かな時間、定期ジョブ。
- アプリ所有Google OAuth、同期カーソル、Webhook、取込重複排除。
- Slack/Chatwork/Zoom/PLAUD NOTEの実コネクター。
- 議事録、提案書、PDF、営業フォロー、委任追跡。
- アイデアBOX、決定ログ、影響分析。
- バックアップ・復元、削除・エクスポート、運用監視。

## 5. 現在のデータ保存方法

### 5.1 ブラウザ内

- DEMOプロジェクト、進捗、KPI、会話は`public/scenarios.js`の固定値。
- 実行中の会話、draft、状態はブラウザメモリのみ。
- `localStorage`/`sessionStorage`は使っていない。

### 5.2 Sites D1

`.openai/hosting.json`の論理バインディング`DB`へ以下を保存する。

| テーブル | 現在の本番行数 | 用途 |
|---|---:|---|
| `oz_projects` | 1 | 簡易事業マスター、KPI、外部リンク |
| `oz_tasks` | 8 | `open`/`done`の簡易タスク |
| `oz_memories` | 0 | 汎用メモリ |

スキーマは`db/schema.ts`と`drizzle/`にある一方、`worker/oz-data.ts`もリクエスト時に`CREATE TABLE IF NOT EXISTS`を実行する。二重管理であり、最上位仕様とADRが禁止するrequest-time DDLに該当する。

### 5.3 外部サービス

- OpenAI Realtime: 音声セッションのみ。会話正本ではない。
- Google Calendar/Gmail/Drive: 環境トークンがある場合にRealtimeから読取可能。同期DB、取込履歴、書込承認はない。
- Slack/Chatwork/SNS/Sales/MCP: 接続状態表示または設定プレースホルダーで、完全な保存・同期処理ではない。
- R2: 未使用（`r2: null`）。
- PostgreSQL: 未接続。

## 6. Sites接続確認

`.openai/hosting.json`は次の内容で、既存Siteと一致している。

```json
{
  "d1": "DB",
  "project_id": "appgprj_6a86a3c8974481918b5d5753af51dac1",
  "r2": null
}
```

Sites側の読取確認結果:

| 項目 | 現在値 |
|---|---|
| Site | OZ COMMAND CENTER |
| 状態 | active |
| URL | `https://oz-command-center.omoshiroproject.chatgpt.site` |
| 最新保存版 | version 4 |
| 最新source commit | `5819f20af3e660a6d9d8783a92362d3b521f7bf4` |
| アクセス | custom、owner 1名、外部visitor 0名 |
| D1 binding | `DB` |
| D1 tables | `oz_projects`, `oz_tasks`, `oz_memories` |
| R2 | なし |
| Preview URL | なし |

ZIPの既存Phase 0資料が示すbaseline source revisionと、Sites最新version 4のsource commitは一致する。したがって今回のZIPは、少なくともSites最新保存版と同じ基準revisionから作られたと判断できる。

Sites環境には`OPENAI_API_KEY`のSecret項目と、Realtime model/transcription/voiceの非Secret設定がある。Secret値は表示・保存していない。Hosted voiceは`cedar`、リポジトリの`.env.example`は`marin`で、設定ドリフトがあるため選択確認が必要である。

## 7. 仕様差分

| 仕様領域 | 状態 | 判定 |
|---|---|---|
| PC 3カラム・OZオーブ・視覚世界観 | 実装済み | 維持対象 |
| Realtime日本語音声 | 一部実装 | 保存、訂正、構造化候補、API再確認が必要 |
| OZ一人称「私」 | Phase 0補強済み | 固定文に禁止語なし。音声system promptとテストへ明示ルールを追加 |
| タスク正本 | 仕様競合 | D1 `open/done`。PostgreSQL 5状態へ移行が必要 |
| 認証・所有者確認 | 仕様競合 | Sites accessは限定済みだが、アプリAPIで強制していない |
| 候補・確認待ちBOX | 仕様競合 | 現在は正式行へ直接書込 |
| 承認・監査・冪等性 | ほぼ未実装 | 一時UIカードのみ。永続境界なし |
| プロジェクト進捗 | 仕様競合 | 固定率/KPI比率。タスク完了数方式ではない |
| モバイル4タブPWA | 未実装 | CSS圧縮のみ |
| テキスト会話 | 未実装 | composerは非機能 |
| Today/Calendar最適化 | 未実装 | 条件付き読取ツールだけ |
| 7:30通知・静かな時間・jobs | 未実装 | ジョブテーブル／schedulerなし |
| Gmail/Drive業務連携 | 一部実装 | Realtime読取のみ。OAuth、同期、取込、承認書込なし |
| Slack/Chatwork/Zoom/PLAUD | 未実装 | 状態プレースホルダーまたは未定義 |
| 委任・返事待ち | 未実装 | 対応テーブル・サービスなし |
| 議事録・提案書・PDF・フォロー | 未実装 | 対応テーブル・サービスなし |
| アイデア・決定・影響分析 | 仕様競合/未実装 | 汎用memoryへ直接保存するだけ |
| セキュリティ運用・復旧 | 一部実装 | Secretはサーバー側。監査、暗号化token、復旧手順は未実装 |

## 8. Sitesで担う機能と外部バックエンド分類

### 8.1 Sitesで継続利用できる

- 現行デザインのWeb UI、静的アセット、Vinext/Worker API gateway。
- owner-only/customアクセス制御と認証済みユーザーヘッダー。
- Site用Secrets・環境変数。
- OpenAI Realtimeへのサーバー側SDP中継。
- D1を使う一時的・移行用の構造化データ。
- R2を有効化した場合のアップロード／PDF／音声等のblob保存。
- 外部APIのWebhook受信口、承認画面、読取専用ダッシュボード。
- Sitesのversion保存・private review・公開。ただしデプロイは常に明示承認後。

### 8.2 Sitesを入口にし、外部サービスを呼ぶ

- OpenAI Realtime/Responsesによる音声、抽出、下書き。
- Google Calendar/Gmail/Drive、Slack、Chatwork、Zoom、PLAUD NOTE。
- Web Push配信、メール・メッセージ送信、Calendar書込。
- Drive検索・移動、提案書の外部保存。

これらはSites Workerから呼べるが、OAuth、所有者、承認、同期カーソル、監査、再試行を外部バックエンド側の共通サービスへ集約する。

### 8.3 最上位仕様を満たすため外部バックエンドが必要

- タスク正本となるmanaged PostgreSQL。
- OAuth refresh tokenの暗号化保管、scope分離、失効管理。
- 7:30 JST、同期、期限通知、営業フォローを動かす永続scheduler/worker。
- queue、指数バックオフ、dead-letter相当、idempotency、外部ID重複排除。
- PostgreSQLのbackup/PITR/restore、開発・テスト・本番分離。
- 構造化ログ、trace、error monitoring、保持・削除ポリシー。

現在のSites設定にはD1以外の永続基盤、R2、cron/queue、PostgreSQL接続がない。SitesはUIと薄いAPI gatewayとして残し、正本・認証・ジョブ・連携実行は外部バックエンドへ置くのが仕様に最も整合する。

## 9. セキュリティ・秘密情報・固定データ

### 9.1 最優先で修正

1. **API認証不在**: `/session`、`/api/oz/*`、`/api/integrations/status`がアプリ内で認証を強制しない。Sitesのcustom accessだけに依存している。
2. **共通owner fallback**: 認証ヘッダーがないと`oz-command-center-owner`から同一owner IDを作る。誤設定や公開範囲変更時に未認証利用者が同じデータ境界へ入る。
3. **承認バイパス**: quick add、音声function call、完了操作、memory保存が`review_items`/`action_approvals`なしでD1を直接変更する。
4. **監査・冪等性なし**: 重要変更のbefore/after、approval ID、idempotency key、trace、再試行保護がない。
5. **request-time DDL**: Workerリクエストが本番DBへテーブル作成を試みる。マイグレーション管理と競合する。

### 9.2 依存関係監査

2026-08-23の`npm audit`結果:

- production: high 4、critical 0
- 全依存関係: high 16、moderate 4、low 1、critical 0
- productionの該当: `next`（direct）、`nanoid`、`postcss`、`sharp`
- dev/toolchainでは`@cloudflare/vite-plugin`、`vite`、`wrangler`、`vinext`、`react-server-dom-webpack`等も該当

Phase 0ではロックファイルを変更していない。Phase 1開始前に、少なくともNext 16.3.2相当への更新候補、React Server DOM、Cloudflare/Vite/Wrangler、Vinextの互換組合せを検証し、再build・回帰テスト後にロックファイルを更新する。自動`npm audit fix --force`は行わない。

### 9.3 秘密情報スキャン

- OpenAI、Google、Slack、GitHub、AWS、private keyの代表的token pattern: ヒットなし。
- 実値入り`.env`、`.dev.vars`、PEM/keyファイル: なし。
- `.env.example`は空欄と非Secret defaultのみ。
- `.openai/hosting.json`のproject IDとD1 bindingは接続metadataで、秘密鍵ではない。
- Sitesのアプリ環境Secret実値は確認・記録していない。読取応答に含まれ得る一時認証情報も使用・転記していない。

### 9.4 固定・機微データ

- `public/scenarios.js`: 5事業、固定進捗、会話、`12.8M`等のKPIデモ値。
- `drizzle/0001_empty_stranger.sql`: 実在事業に見える名称、担当者名、KPI、期限、Drive/Slack/Chatwork URL・ID、8件の業務タスク、owner hashをseedとして保持。
- 本番D1: 上記に対応する1 project、8 tasksが存在。
- これらはAPIキーではないが、個人情報・社内業務情報・連携先識別子である。公開リポジトリへ移す前に、fixture化、匿名化、または暗号化した移行データへの分離が必要。

### 9.5 その他

- D1のproject URLを`href`へ出す前に`https:` allowlistをサーバー側で検証する。
- Zod等で入力schema、enum、長さ、日時、URLを検証する。現在は文字列切り詰め中心。
- 内部例外messageをそのまま400へ返さず、trace ID付きの安全なエラーへ変換する。
- CSP、セキュリティヘッダー、rate limit、mutation size limitをPhase 1で追加する。
- `/session`は認証・rate limit・使用量制御を行い、OpenAI API利用枠の悪用を防ぐ。

## 10. 推奨構成

```text
PC / iPhone PWA
  → Sites: preserved OZ UI + thin Vinext/Worker gateway
    → Auth/ownership middleware
      → Application services
        ├─ Task / Project / Review
        ├─ Approval / External Action / Audit / Idempotency
        ├─ Today / Calendar planning
        └─ Conversation / AI candidate extraction
          → Managed PostgreSQL (source of truth)
          → Job worker / scheduler / queue
          → Connector adapters
             Google / Slack / Chatwork / Zoom / PLAUD / OpenAI
          → R2 or approved object storage for blobs
```

リポジトリは既存ADRの依存方向を採用する。

```text
app/                  UI、API routes、server actions
packages/contracts/   enum、Zod schema、API/connector contracts
packages/domain/      entity、状態遷移、不変条件
packages/application/ use case、承認、監査、優先順位
packages/db/          PostgreSQL schema、migration、repository
packages/auth/        Google allowlist、session、owner context
packages/ai/          structured extraction、prompt contracts
packages/connectors/  外部サービスadapter
packages/jobs/        scheduler handler、retry policy
packages/ui/          既存OZ component、design token
worker/                Sites/Cloudflare固有adapterのみ
```

D1は移行期間中にread-only legacy sourceとして保持し、件数・hash・代表queryを照合してからPostgreSQLへ切り替える。元D1は削除しない。

## 11. Phase 1実装計画

### 11.1 順序

1. 依存関係の脆弱性解消とビルド互換確認。
2. managed PostgreSQL、dev/test DB、migration、backup/restore方針を確定。
3. Google単一アカウントallowlistと全API共通owner contextを実装し、fallbackを削除。
4. projects/tasks/task_dependencies/task_sources/review_itemsを実装。
5. external_actions/action_approvals/idempotency_keys/audit_logsを実装。
6. D1 export/import rehearsal。legacy ID、件数、hash、UTC日時を検証。
7. 現行quick add/音声toolを「正式タスク作成」から「候補作成」へ切替。
8. 認証・所有権・状態遷移・承認・冪等性・監査の自動テストを追加。
9. UIの配色・3カラム・オーブ・情報密度を変えずにPhase 1 APIへ接続。

### 11.2 既存の変更対象

- `package.json`, `package-lock.json`: 安全な依存組合せ、DB/auth/test scripts。
- `.env.example`: PostgreSQL、Google OAuth、暗号化、monitoring設定の必須/任意整理。
- `app/chatgpt-auth.ts`: Sites identityとGoogle allowlistの責務整理。未使用状態を解消。
- `worker/index.ts`: 共通認証、rate limit、安全なerror、thin gateway化。
- `worker/oz-data.ts`: request-time DDLと直接D1 mutationを撤去。legacy read adapterへ縮小。
- `worker/oz-system-prompt.ts`: task toolをreview candidate境界へ変更し「私」ルールを維持。
- `public/live-oz.js`: tool result/approvalを永続review APIへ接続。
- `public/oz-network.js`: quick add/completeを候補・承認・監査付きAPIへ変更。
- `db/schema.ts`, `drizzle.config.ts`, `drizzle/`: D1正本扱いを終了し、移行sourceとして明示。
- `vite.config.ts`: local bindingと外部backend envの安全な分離。
- `scripts/install-ci.sh`, `scripts/build-verified.sh`, `scripts/sites-env.sh`: macOS/Linux両対応、共通環境変数の上書き回避。
- `tests/phase0-governance.test.mjs`, `tests/rendered-html.test.mjs`: 新認証・境界へ更新。
- `README.md`, `docs/phase0/*`, `docs/architecture/*`: 実行手順、migration、restore、残差更新。

### 11.3 新規作成候補

- `packages/domain/src/projects.ts`
- `packages/domain/src/tasks.ts`
- `packages/domain/src/reviews.ts`
- `packages/application/src/task-service.ts`
- `packages/application/src/review-service.ts`
- `packages/application/src/approval-service.ts`
- `packages/application/src/audit-service.ts`
- `packages/application/src/idempotency-service.ts`
- `packages/db/src/schema/*`
- `packages/db/src/repositories/*`
- `packages/db/migrations/*`
- `packages/auth/src/owner-context.ts`
- `packages/auth/src/google-allowlist.ts`
- `app/api/projects/route.ts`
- `app/api/tasks/route.ts`
- `app/api/reviews/route.ts`
- `app/api/actions/route.ts`
- `app/api/audit/route.ts`
- `scripts/export-d1.mjs`
- `scripts/import-d1-to-postgres.mjs`
- `scripts/verify-data-migration.mjs`
- `tests/auth/*`, `tests/domain/*`, `tests/application/*`, `tests/migrations/*`, `tests/api/*`

実ファイル分割はPhase 1開始時に最小化してよいが、UI/Realtime/MCP/connectorが個別にDBへ書く構成には戻さない。

## 12. 確認が必要な事項

Phase 1開始前に必須:

1. 許可するGoogleアカウントは、現在のSites owner 1名と同じでよいか。
2. managed PostgreSQLのprovider、region、backup retention、PITR、restore目標。
3. error monitoring/trace provider、data residency、保持期間。
4. PostgreSQL用job worker/schedulerをどこで運用するか。
5. 本番D1の1 project / 8 tasksを正式移行対象にするか。seed内の担当者名、業務タスク、Drive/Slack/Chatwork IDをソースから除去してよいか。
6. hosted voice `cedar`とlocal default `marin`のどちらを正式値にするか。
7. 既存Sitesを長期review hostとして維持するか。Phase 1中もcustom owner-onlyを維持するか。
8. Google OAuthのdevelopment/test/production clientを分離して用意できるか。

Phase 4以降までに確認:

- Google Calendar/Gmail/Driveの最小scopeと審査方針。
- 初期Web Push対象iPhoneとPWA通知許可フロー。
- Slack/Chatwork/Zoom/PLAUD NOTEの契約・権限・代替取込経路。

## 13. 今回の限定変更

- 別添仕様書を`docs/`直下へ配置し、同一内容のZIP内コピーを除外。
- 仕様書参照パスを更新。
- Realtime音声system promptへOZの一人称「私」を明記。
- 一人称の回帰テストを「私」必須、`俺/僕/ぼく/オレ/わたくし`禁止へ強化。
- 本報告書を追加。

画面、CSS、デモデータ、DB schema、D1本番データ、Sites環境、アクセス設定、保存version、公開状態には変更を加えていない。
