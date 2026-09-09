# 雄一郎側セットアップ手順（developmentのみ）

## はじめに

Phase 1Aのソース準備は完了しているが、外部アカウントへのログイン、Supabase project作成、Google OAuth設定、Sentry作成、Secret登録、remote migration、Edge Function deployは実行していない。この文書の操作はすべてdevelopment専用である。testとproductionでは同じ値を流用せず、別project・別OAuth client・別Secret・別Sentry environmentを作る。

Secretの実値は、コード、README、チャット、スクリーンショット、ログへ貼らない。`SUPABASE_SERVICE_ROLE_KEY`をブラウザへ渡さず、`NEXT_PUBLIC_`を付けない。

## 0. ローカルで先に確認する

1. Docker Desktop等のDocker互換runtimeをインストールして起動する。
2. project rootで `npm ci` を実行する。
3. `.env.example` をGit管理外の `.env` へコピーする。
4. この時点では空欄へ架空値を入れない。
5. `npm run verify:phase1a` が成功することを確認する。

Supabase CLIはproject rootの`.env`を`supabase/config.toml`の`env(...)`参照へ読み込む。ローカルstackにはDocker互換runtimeが必要である。公式手順: [Managing config and secrets](https://supabase.com/docs/guides/local-development/managing-config)、[Local development workflow](https://supabase.com/docs/guides/local-development/cli-workflows)

## 1. Supabase development projectを作る（要ログイン・ここから手動）

1. Supabaseへログインする。
2. development専用の新規projectを1つ作る。
3. Regionは **Northeast Asia (Tokyo) / `ap-northeast-1`** を選ぶ。
4. project URL、publishable/anon key、server-side secret/service-role keyはPassword Manager等へ保存し、チャットへ貼らない。
5. この時点ではD1の1 project／8 tasksを投入しない。

東京regionの公式表記: [Available regions](https://supabase.com/docs/guides/platform/regions)

## 2. Google OAuth development clientを作る

1. Google Cloud Consoleへログインし、development専用projectを作る。
2. OAuth consent screenを設定する。公開前のTesting状態を使い、Test usersにはownerの1メールアドレスだけを登録する。
3. scopeは初期段階では `openid`、`email`、`profile`だけにする。Gmail、Calendar、Driveの業務scopeはPhase 1B以降に目的別で追加する。
4. OAuth client typeはWeb applicationを選ぶ。
5. Authorized JavaScript originsへdevelopmentのapp originを追加する。ローカルは `http://localhost:5173` と `http://127.0.0.1:5173` を使う。
6. Authorized redirect URIsへローカル用 `http://127.0.0.1:54321/auth/v1/callback` と、Supabase DashboardのGoogle provider画面に表示されるdevelopment callback URLを正確に追加する。
7. Client IDとClient SecretをPassword Managerへ保存し、repositoryへ書かない。

redirect URIは完全一致が必要である。公式手順: [Supabase Login with Google](https://supabase.com/docs/guides/auth/social-login/auth-google)、[Google OAuth web-server applications](https://developers.google.com/identity/protocols/oauth2/web-server)

## 3. Supabase AuthへGoogle development clientを設定する

1. development projectのAuthentication → Providers → Googleを開く。
2. Google providerを有効にする。
3. development用Client IDとClient SecretをDashboardのSecret入力欄へ登録する。
4. Site URLとRedirect URLsへdevelopment URLだけを登録する。
5. ownerメールでログインでき、別メールがGoogle Testing userになっていないことを確認する。

ローカルCLIではproject rootの`.env`に以下のキー名を用意する。実値は本文へ書かない。

```dotenv
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET=
```

## 4. OZ development環境変数を設定する

Git管理外の`.env`にdevelopment値だけを登録する。

```dotenv
OZ_ALLOWED_EMAIL=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SENTRY_DSN=
SENTRY_ENVIRONMENT=development
```

- `OZ_ALLOWED_EMAIL`: ownerのGoogleメール。コードへ書かない。
- `SUPABASE_URL`: development project URL。
- `SUPABASE_ANON_KEY`と`NEXT_PUBLIC_SUPABASE_ANON_KEY`: 同じdevelopment publishable/anon credential。ブラウザ利用可だが、回答やログへは出さない。
- `SUPABASE_SERVICE_ROLE_KEY`: サーバー専用。`NEXT_PUBLIC_`禁止。
- `NEXT_PUBLIC_SUPABASE_URL`: development project URL。

ローカルEdge Function用Secretは `supabase/functions/.env` または `supabase functions serve --env-file` で別管理できる。公式手順: [Edge Function environment variables](https://supabase.com/docs/guides/functions/secrets)

## 5. ローカルSupabaseへmigrationを適用する

1. Docker runtimeが起動していることを確認する。
2. `npm run supabase:start` を実行する。初回はlocal image取得に時間がかかる。
3. migrationが成功したら `npm run supabase:status` でlocal URLだけを確認する。表示されるcredentialをログやチャットへ貼らない。
4. `npm run dev` でOZを起動する。
5. NETWORKを開き、owner Googleアカウントで認証する。
6. quick addが正式taskではなくPENDING reviewを作ることを確認する。
7. migration errorが出た場合はremoteへ進まず、error codeとSecretを除いた短いmessageだけを共有する。

`pgmq_public`はlocal configで公開schemaに含めているが、send wrapperは`service_role`だけが実行できる。Queueの公式仕様: [Queues API](https://supabase.com/docs/guides/queues/api)、[Expose local queues](https://supabase.com/docs/guides/queues/expose-self-hosted-queues)

## 6. Remote development migration（明示承認後のみ）

以下はremote databaseを書き換えるため、Phase 1Aでは実行しない。

1. `supabase login`
2. development projectだけへ `supabase link`。
3. dry-run/diffを確認。
4. 明示承認後にdevelopmentへmigrationを適用。
5. D1データは投入しない。

CLI commandは`--local`と`--linked`で対象が異なるため、remote操作前に必ず対象project refを目視する。公式注意事項: [Local development workflow](https://supabase.com/docs/guides/local-development/cli-workflows)

## 7. Cron・Queues・Edge Functions

- migrationは`pg_cron`、`pgmq`、durable queue `oz_jobs`を準備する。
- Cron scheduleはまだ登録しない。
- `oz-job-dispatch`はUUIDのresource referenceだけをqueueへ送り、タスク本文やメール本文をlogへ出さない。
- `SHORT`は将来Edgeで処理可能、`LONG`は`EXTERNAL_WORKER_REQUIRED`として将来workerへ分離する。
- Edge Function deploy、remote Secret登録、external worker接続はPhase 1Aでは行わない。

## 8. Sentry development project

1. Sentryへログインし、development専用project/environmentを作る。
2. DSNはGit管理外Secretへ登録する。
3. Send Default PIIは無効のままにする。
4. server/edgeのevent processorでは、operation、trace ID、safe error code、HTTP status以外を送らない。
5. タスク本文、メール本文、氏名、メールアドレス、request payload、Authorization header、OAuth token、Supabase/OpenAI/Google Secretを添付しない。
6. Phase 1Aでは接続境界のみで、実際のSentry送信はまだ有効化しない。

## 9. Sites development確認

既存Sites projectと`.openai/hosting.json`は維持する。Sitesはowner-onlyの確認・公開先だが、Phase 1AではSecret登録、version保存、公開、deployを行わない。後日、development Supabaseが検証済みになった後、Sites側のserver-only Secretとpublic auth configを一つずつ登録する。

## 10. 完了チェック

- [ ] development Supabase projectのみ作成した
- [ ] regionがTokyo `ap-northeast-1`
- [ ] Google OAuth clientはdevelopment専用
- [ ] Google Test userはowner 1名
- [ ] `OZ_ALLOWED_EMAIL`はSecret管理
- [ ] service-role credentialはserver-only
- [ ] local migrationが成功
- [ ] quick add／音声taskはPENDING review止まり
- [ ] D1の正式移行は未実施
- [ ] remote migration／Edge deploy／Sites deployは未実施
