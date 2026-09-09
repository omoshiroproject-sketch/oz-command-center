# OZ COMMAND CENTER 現状要件・エンジニア引継ぎ資料

更新日: 2026-09-09 JST

## 1. この資料の位置づけ

この資料は、OZ COMMAND CENTER の現時点の実装状態をエンジニアへ共有するためのスナップショットです。

要件の優先順位は次のとおりです。

1. `docs/OZ_COMMAND_CENTER_開発仕様書_v2.0_20260823.md`
2. `docs/adr/` 配下の承認済み ADR
3. `docs/phase0/UI_BASELINE.md`
4. この資料

最上位仕様と現在の実装に差がある場合、最上位仕様を将来要件、この資料を現在の実装状況として扱ってください。

## 2. 共有時点のソース状態

- 基準コミット: `dcf09e0d8e45750efff00d7c8a98c0f8f562591f`
- 基準タグ: `phase1b-daily-priority-ui-verified-20260827`
- 基準ブランチ: `phase1b-voice-mcp-local`
- Phase 1C-A のローカル計測基盤9ファイルを基準コミット上の未commit変更として含む
- `.env`、Secret、ローカルDB、D1 private backup、ビルド成果物、起動ログは共有対象外
- ローカルSupabaseの実データはGitHubへ含めない

Phase 1C-A の未commit対象は次のとおりです。

- `app/oz-scripts.tsx`
- `public/live-oz.js`
- `public/oz-network.js`
- `public/oz-latency-metrics.js`
- `tests/latency-metrics.test.mjs`
- `tests/live-oz-ui.test.mjs`
- `tests/rendered-html.test.mjs`
- `tests/review-ui.test.mjs`
- `tests/task-workspace-ui.test.mjs`

## 3. プロダクトの目的

OZ COMMAND CENTER は、1名のownerが音声とAIを通じて、プロジェクト、タスク、確認待ち、外部サービス連携を一元管理するためのコマンドセンターです。

重要な原則は次のとおりです。

- PostgreSQLを正式データの唯一の正本とする
- AI、音声、Quick Add、外部サービス由来の入力は候補として作成する
- 候補はownerの明示承認後だけ正式データへ反映する
- 外部への書き込みは提案、承認、実行を分離する
- すべてのmutationで認証、owner確認、入力検証、状態遷移、冪等性、監査を維持する
- OZの一人称は音声、チャット、画面、通知のすべてで「私」に統一する

## 4. 現在の構成

### フロントエンド

- Next.js / React
- PCは既存の3カラム構成、暗く未来的な配色、OZオーブを維持
- 日本語UI
- TASKS、LIVE OZ、OZ NETWORK、確認待ち、承認、履歴を提供
- `/demo` はlocalhost限定の専用経路で、正式データと分離

### API・アプリケーション層

- Next.js route handlers / worker route
- Zodによる契約検証
- domain state machineによる状態遷移検証
- application serviceを介してreview、approval、idempotency、auditを処理
- 単件解決、一括解決、音声解決は同じサーバー側review解決境界を使用

### データベース

- Supabase PostgreSQL
- migration管理のみ。request-time DDLは禁止
- developmentの想定リージョンはTokyo / `ap-northeast-1`
- RLSを全アプリテーブルで維持
- browserの`anon` / `authenticated`へ直接テーブル権限を付与しない
- server-only credentialには必要最小限のSELECTとRPC実行境界を使用

実装済みアプリテーブル:

- `projects`
- `tasks`
- `task_dependencies`
- `task_sources`
- `review_items`
- `external_actions`
- `action_approvals`
- `idempotency_keys`
- `audit_logs`

`projects.target_date` はnullableな`date`で、API・contract・repository・UIでは`targetDate`として扱います。

### 認証

- Supabase Auth + Google OAuth
- development / test / productionを分離する前提
- 現在はdevelopmentを対象
- `OZ_ALLOWED_EMAIL`による単一owner allowlist
- allowlist値はコードに記載しない
- 未認証時の共通owner fallbackは禁止
- 全APIで認証とowner確認が必要

### Realtime音声

- OpenAI Realtime WebRTC
- model: `gpt-realtime-2.1`
- voice: `cedar`
- VAD: `semantic_vad / auto`
- noise reduction: `far_field`
- 通常の`OPENAI_API_KEY`はserver-only
- browserには短期client secretだけを渡す
- MIC DISCONNECTとEscでRealtime接続とマイクを安全に停止可能
- tool実行と成功メッセージの重複を抑止
- 実音声・transcript本文を永続保存しない

### 外部連携

- connectorの型、安全境界、mockは用意済み
- live connector接続と外部書き込みは未実装
- 長時間処理はEdge Functionsへ閉じ込めず、将来の外部workerへ分離可能な境界を維持
- Sentry接続を想定したsafe monitoring境界はあるが、タスク本文、メール本文、個人情報、OAuth tokenをログへ含めない

## 5. 実装済みの主要フロー

### タスク・プロジェクト作成

- Quick Addと音声タスク作成は`TASK_CREATE / PENDING`を作成
- 初期プロジェクト候補は`PROJECT_CREATE / PENDING`を作成
- 承認時のみformal project / taskを作成
- `REJECTED` / `NEEDS_EDIT`ではformal dataを作成しない
- 固定された冪等キーと正式データ・候補双方の重複検査を使用

### タスク変更

- status変更は`TASK_STATUS_CHANGE`候補を作成
- 期限等の変更は`TASK_EDIT`候補を作成
- 画面からformal taskを直接updateしない
- 承認後にcontextを再取得し、正式状態をサーバーで確認してから成功表示する

### 確認待ち

- 単件のAPPROVE / REJECT / NEEDS_EDIT
- チェックボックス、一括選択、一括解決
- 実行前に操作、件数、対象名を再確認
- 一部失敗を候補別に表示
- HTTP成功とresponse bodyに加え、server contextで解決済みを確認
- LIVE OZの音声一括承認は二段階確認を必須とし、同じreview serviceを使用

### 今日の優先順位

- 基準timezoneは`Asia/Tokyo`
- `IN_PROGRESS`は期限の近い順を基本に表示
- `WAITING`は通常作業候補と分離し、期限接近アラートとして表示
- `COMPLETED`は今日の作業候補から除外
- 同期限・同重要度は安定した順序で表示
- dueAtはUTC保存でもJSTの日付境界で解釈

## 6. Phase 1C-A 計測基盤

共有ソースには、まだ正式チェックポイント化していないローカル診断実装が含まれます。

- `performance.now()`を用いる単調増加時間
- メモリ内の上限付きring buffer
- ページ再読み込みで消去
- DB、Storage、Cookie、ファイル、外部分析へ保存しない
- transcript本文、音声、tool引数、response本文、氏名、メール、ID、token、Secret、raw call IDを保持しない
- ページ内連番と固定allowlistのevent/tool分類のみを使用
- output audio transcript deltaを音声生成開始の代理指標として計測
- remote track受信とaudio element playingは接続単位で計測
- VADの過検出切り分けとしてturn継続時間、response進行中のspeech start、cancelled、マイク処理booleanを記録

注意事項:

- output audio transcript deltaは物理スピーカー再生開始ではない
- Phase 1C-Bのアニメーション表示・VAD tuningには未着手
- 実マイクA/B検証では診断snapshotが空になるケースがあり、Phase 1C-A完了判定前に再現確認が必要

## 7. 現在未実装・未接続の範囲

- production Supabase projectへのremote migrationと本番データ投入
- Sitesへの最新版保存・公開・deploy
- Google Calendar、Gmail、Drive、Slack、Chatwork、Zoom、PLAUD等のlive connector
- 外部メール、メッセージ、カレンダーへの実書き込み
- Cron / Queues / Edge Functions / 外部workerの本番運用
- production MCP OAuth 2.1認証
- Phase 1C-Bの回答内容連動アニメーション
- semantic VAD感度・テンポの本調整
- 最上位仕様にある会議、提案、意思決定、通知等の残りの完全実装

## 8. ローカルデータの扱い

最後に確認されたローカル実データの業務スナップショットは、formal projects 17件、formal tasks 9件です。

- ローカルDBデータはこのGitHubリポジトリに含めない
- `data/legacy-d1/private/`はGit管理外
- D1はread-only legacy sourceとして保持し、自動移行しない
- backup / dumpは別経路で安全に受け渡す
- migrationや自動テストは実データをreset・変更しない手順で実行する

## 9. 環境変数

値はGitHubへ登録せず、`.env.example`の変数名を使用して各自のGit管理外`.env`またはSecret storeへ設定します。

主要な変数名:

- `OZ_ALLOWED_EMAIL`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`
- `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET`
- `OPENAI_API_KEY`
- `OZ_REALTIME_MODEL`
- `OZ_VOICE`
- `OZ_TRANSCRIPTION_MODEL`
- `OZ_SAFETY_IDENTIFIER_SALT`
- `SENTRY_DSN`
- `SENTRY_ENVIRONMENT`

互換性のため旧Supabase key名も受け付ける箇所がありますが、新しいpublishable / secret key名を優先します。Secretの実値をREADME、issue、PR、ログへ貼らないでください。

## 10. ローカル起動と検証

前提:

- Node.js / npm
- Docker DesktopまたはDocker互換runtime
- Supabase CLI
- Git管理外`.env`

主要コマンド:

```bash
npm ci
npm run supabase:start
npm run db:verify
npm run dev
npm run verify:phase1b
```

ローカルURL:

- OZ: `http://127.0.0.1:5173/`
- localhost専用demo: `http://127.0.0.1:5173/demo`

`verify:phase1b`ではlint、typecheck、build、自動テスト、DB permission/RLS/approval/idempotency/auditのrollback検証、Secret scanを実行します。

## 11. 変更時に壊してはいけない境界

- OZトップ画面、3カラム、配色、オーブ、情報密度を無断で全面変更しない
- formal DBへ画面・AI・音声から直接mutationしない
- review service / RPCを迂回しない
- RLS、owner境界、audit、idempotencyを弱めない
- `anon` / `authenticated`へ直接テーブル権限を追加しない
- request-time DDLを復活させない
- Secret、token、Authorization header、本文、個人情報をログへ出さない
- `npm audit fix --force`を使用しない
- D1 legacyデータを自動移行・変更しない
- remote migration、外部connector、deploy、Sites公開を明示承認なしで行わない

## 12. エンジニアが最初に読むファイル

1. `AGENTS.md`
2. `docs/OZ_COMMAND_CENTER_開発仕様書_v2.0_20260823.md`
3. `docs/adr/0001-spec-authority-and-ui-preservation.md`
4. `docs/adr/0002-domain-enums-and-data-model.md`
5. `docs/adr/0003-approval-audit-and-idempotency-boundary.md`
6. `docs/adr/0005-supabase-development-and-owner-auth.md`
7. `docs/adr/0006-shared-tools-realtime-and-mcp-boundary.md`
8. `docs/architecture/CODEBASE_MAP.md`
9. `docs/phase1a/PHASE_1A_IMPLEMENTATION_REPORT_20260823.md`
10. この資料
