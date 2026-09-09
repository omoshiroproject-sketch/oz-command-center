# OZ COMMAND CENTER

16:9の撮影画面を優先した、OZ（オズ）とのリアルタイム音声会話インターフェースです。

## Authoritative specification and Phase 1A

The highest-level requirement source is
`docs/OZ_COMMAND_CENTER_開発仕様書_v2.0_20260823.md`. The current UI is
preserved as the visual baseline. Current implementation gaps and the staged
D1-to-PostgreSQL/local-Codex migration are documented in:

- `docs/phase0/CURRENT_STATE_AND_GAP_ANALYSIS.md`
- `docs/phase0/PHASE_0_AUDIT_REPORT_20260823.md`
- `docs/phase0/PHASE_0_MIGRATION_PLAN.md`
- `docs/architecture/TARGET_LOCAL_PROJECT.md`
- `docs/adr/`

Phase 1A uses Supabase PostgreSQL/Auth as the development target and keeps Sites D1 read-only. Run `npm run verify:phase1a` before handing off a source revision. Owner setup is documented in `docs/phase1a/OWNER_SETUP_DEVELOPMENT.md`.

## Modes

- **DEMO** — `public/scenarios.js` の固定台本を再生します。APIキー不要です。
- **LIVE OZ** — OpenAI Realtime APIへWebRTCで接続し、日本語の音声会話と逐次トランスクリプトを表示します。
- **Wake word** — Realtime設定済みのChromeでは「OZ / オズ」の呼びかけを待機し、自動でLIVE OZへ切り替えます。初回のみマイク許可が必要です。

## Runtime configuration

必須Secret:

- `OPENAI_API_KEY`

通常のEnvironment variables:

- `OZ_REALTIME_MODEL`（default: `gpt-realtime-2.1`）
- `OZ_VOICE`（正式音声・default: `cedar`）
- `OZ_TRANSCRIPTION_MODEL`（default: `gpt-4o-mini-transcribe`）

標準APIキーはWorker内の`/session`だけが読みます。ブラウザへは渡しません。`/session`はSDPとセッション設定をOpenAIへ中継し、WebRTCのSDP answerだけを返します。

## Realtime state mapping

- `input_audio_buffer.speech_started` → LISTENING
- `input_audio_buffer.speech_stopped` / `response.created` → THINKING
- `output_audio_buffer.started` / output transcript delta → SPEAKING
- output buffer stopped / response complete → LISTENING

入力文字起こしとOZの出力トランスクリプトは、確定前のdeltaもLIVE CHATへ表示します。

## Integration boundaries

`worker/integrations.ts`がGoogle Calendar、Gmail、Google Drive、PostgreSQL、SNS Analytics、Sales Data、Slack、Chatworkのサーバー側adapter境界を定義しています。正式タスクはSupabase PostgreSQLだけを正本とし、外部サービスは対応するSecretまたはOAuth認証後のみ有効になります。Phase 1Aは外部送信・Calendar書き込みを実装・実行しません。

## Data boundary

左側PROJECTSとDEMO内のKPIは`public/fixtures/oz-demo-v1.js`へ分離したデモfixtureです。正式データへは自動移行しません。OZ NETWORKの読み書きは認証後のSupabase境界を使い、quick addと音声taskはまず確認待ち候補になります。

## ローカルソースの構成

このリポジトリだけで、現在のOZ画面、デモ、Realtime音声、LIVE CHAT、
OZ NETWORK、D1データ境界、Sites接続設定を再現できます。

```text
app/                         画面、レイアウト、CSS、ブラウザスクリプト読込
public/                      デモ、音声、ネットワークUI、SVG等の公開アセット
worker/                      Sites/Cloudflare Worker、Realtime、認証済みAPI
db/                          DrizzleによるPostgreSQL schema
supabase/                    local config、migration、Edge Function境界
data/legacy-d1/              D1 read-only schema、Git管理外backup
drizzle/                     D1のschema-only legacy migration
packages/contracts/          v2.0のenum・コネクター境界
docs/OZ_COMMAND_CENTER_開発仕様書_v2.0_20260823.md
                              OZ COMMAND CENTER 開発仕様書 v2.0（最上位仕様）
docs/phase0/                 現状差分、移行計画、監査結果
docs/phase1a/                development設定、D1移行候補、実装記録
docs/adr/                    最上位仕様・DB・承認・開発構成の決定記録
tests/                       レンダリング・設定・仕様ガードテスト
scripts/                     インストール、ビルド、成果物検証
.openai/hosting.json         既存ChatGPT Sitesとの接続情報
```

この実装はNext App Routerの`app/`をルートで使用するため、別の`src/`
フォルダはありません。画像・SVG・ブラウザJSは`public/`がアセット置場を
兼ねるため、別の`assets/`フォルダも不要です。

## 必要環境

- Node.js `22.13.0`以上
- npm（`package-lock.json`を使用）
- Chrome等のWebRTC対応ブラウザ
- local Supabaseを起動する場合はDocker互換runtime
- 認証済みAPIを使う場合はdevelopment SupabaseとGoogle OAuth設定
- LIVE OZを使う場合のみ、有効なOpenAI APIキーとPlatform側の利用枠

## ローカルで起動する

1. ZIPを展開し、ターミナルで展開したフォルダへ移動します。
2. 依存関係をロックファイルどおりにインストールします。

   ```bash
   npm ci
   ```

3. DEMO MODEの静的画面だけを確認する場合、外部Secretは不要です。
4. 認証済みAPIやLIVE OZを確認する場合は、追跡対象外の`.env`を作成します。

   ```bash
   cp .env.example .env
   ```

   空欄へ架空値を入れず、`docs/phase1a/OWNER_SETUP_DEVELOPMENT.md`に沿ってdevelopment値だけを設定してください。`.env`をGitやチャットへ貼り付けないでください。

5. 開発サーバーを起動します。

   ```bash
   npm run dev
   ```

6. ターミナルに表示されるローカルURLをブラウザで開きます。LIVE OZでは
   ブラウザのマイク利用を許可してください。

停止する場合は、起動したターミナルで`Ctrl + C`を押します。

## ビルド・テスト

仕様書、既存UI、lint、本番ビルド、主要APIテストをまとめて確認します。

```bash
npm run verify:phase1a
```

個別に実行する場合:

```bash
npm run lint
npm run build
npm test
```

本番相当のローカルサーバーは、ビルド後に以下で起動します。

```bash
npm run start
```

## データベース

正式データの正本はSupabase PostgreSQLです。

- type-safe schema: `db/schema.ts`
- migration正本: `supabase/migrations/202608230001_phase1a_core.sql`
- local Supabase設定: `supabase/config.toml`
- migration contract検証: `npm run db:verify`
- D1 legacy schema: `data/legacy-d1/schema.ts`
- D1確認一覧: `docs/phase1a/D1_MIGRATION_CANDIDATES_20260823.md`

request-time DDLはありません。Sites本番D1は比較用read-only sourceとして残し、1 project／8 tasksはPostgreSQLへ投入していません。完全backupはGit管理外に置かれます。

## 既存ChatGPT Sitesへ再接続する

`.openai/hosting.json`は存在し、このZIPへ含まれています。現在の論理設定は
以下です。

```json
{
  "d1": "DB",
  "project_id": "appgprj_6a86a3c8974481918b5d5753af51dac1",
  "r2": null
}
```

再接続手順:

1. ZIPを展開したフォルダをCodexで開きます。
2. `.openai/hosting.json`を削除・変更しないでください。
3. Codexへ「このローカルOZプロジェクトを既存Sitesへ接続して」と依頼します。
4. Codexは`project_id`を使って既存のOZ Siteを取得します。
5. Sites SecretsはZIPから復元されません。development検証後、必要な値を一つずつSites側で登録します。
6. デプロイは本番反映です。内容確認後、明示的に再デプロイを依頼してください。

別のSitesへ複製する場合、既存の`project_id`を流用せず、新しいSiteを作成して
生成された`.openai/hosting.json`へ置き換えてください。

## ZIPに含めないもの

- `node_modules/`
- `.sites-runtime/`、`.wrangler/`、`.next/`、`dist/`
- `.env`、`.env.local`、`.dev.vars`等の実値ファイル
- OpenAI APIキー、OAuthトークン、Sites Secrets
- Git管理外のD1完全backupと外部IDを含む移行確認データ
- Git内部データ（`.git/`）

`.env.example`にはキー名と安全な初期値だけを収録し、秘密情報の値は収録しません。
書き出し内容の一覧は`SOURCE_EXPORT_MANIFEST.md`を参照してください。
