import OzScripts from "./oz-scripts";
import SupabaseAuth from "./supabase-auth";

export function OzCommandCenter({ includeLocalDemo = false }: { includeLocalDemo?: boolean } = {}) {
  return (
    <>
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />
      <div className="scanline" />

      <div id="app" className="app-shell">
        <header className="topbar frame">
          <div className="brand-block">
            <div className="oz-sigil" aria-hidden="true">
              <span className="sigil-ring ring-a" />
              <span className="sigil-ring ring-b" />
              <span className="sigil-core" />
            </div>
            <div>
              <div className="brand-row"><strong>OZ</strong><span>AI PARTNER</span></div>
              <div className="brand-sub">PRIVATE INTELLIGENCE INTERFACE</div>
            </div>
          </div>

          <div className="topbar-center"><span>COMMAND CENTER</span><i /><time id="clock">--:--:--</time></div>

          <div className="system-block">
            <div className="session-copy"><span>セッション</span><strong id="sessionId">OZ-01</strong></div>
            <div className="online"><b />オンライン</div>
          </div>
        </header>

        <main className="dashboard-grid">
          <aside className="frame panel projects-panel">
            <div className="panel-heading">
              <div><span className="eyebrow">稼働中ワークスペース</span><h2>プロジェクト</h2></div>
              <span id="projectCount" className="panel-meta">00 稼働中</span>
            </div>
            <div className="project-toolbar">
              <button id="initialCandidateBtn" type="button" title="初期候補を確認待ちへ送ります">初期候補</button>
              <button id="demoModeHintBtn" type="button" disabled title="デモデータは正式データから分離されています">デモは分離</button>
            </div>
            <div id="projectList" className="project-list" />
            <div className="project-hint">正式データ / SUPABASE</div>
          </aside>

          <section className="frame panel oz-panel" id="ozPanel">
            <div className="stage-grid" aria-hidden="true" />
            <div className="stage-corner corner-tl" /><div className="stage-corner corner-tr" />
            <div className="stage-corner corner-bl" /><div className="stage-corner corner-br" />

            <div className="stage-head">
              <div><span className="eyebrow">コアインターフェース</span><span className="stage-code" id="stageCode">OZ / 待機中</span></div>
              <div className="signal-bars" aria-hidden="true"><i /><i /><i /><i /><i /></div>
            </div>

            <div className="oz-stage">
              <div id="orb" className="orb idle" aria-label="OZの状態表示">
                <div className="orbit orbit-outer"><span /><span /><span /></div>
                <div className="orbit orbit-mid"><span /><span /></div>
                <div className="orbit orbit-inner" /><div className="orb-halo" /><div className="orb-core" />
                <div className="wave" id="wave">{Array.from({ length: 16 }).map((_, index) => <span key={index} />)}</div>
              </div>
              <div className="state-row"><span id="ozStateDot" className="state-dot" /><span id="ozState">待機中</span></div>
            </div>

            <section id="taskWorkspace" className="task-workspace" aria-live="polite">
              <div className="task-workspace-head">
                <div className="task-view-tabs" role="tablist" aria-label="タスク表示">
                  <button className="active" type="button" role="tab" aria-selected="true" data-task-view="TODAY">今日</button>
                  <button type="button" role="tab" aria-selected="false" data-task-view="OVERDUE">期限超過</button>
                  <button type="button" role="tab" aria-selected="false" data-task-view="WEEK">予定</button>
                  <button type="button" role="tab" aria-selected="false" data-task-view="ALL">すべて</button>
                  <button type="button" role="tab" aria-selected="false" data-task-view="COMPLETED">完了</button>
                </div>
                <button id="newTaskCandidateBtn" className="task-add-button" type="button" title="正式登録前の確認待ち候補を作成します">＋候補を追加</button>
              </div>
              <div className="task-filter-row">
                <select id="taskProjectFilter" aria-label="プロジェクトで絞り込み"><option value="">全プロジェクト</option></select>
                <select id="taskStatusFilter" aria-label="ステータスで絞り込み"><option value="">全ステータス</option><option value="UNSTARTED">未着手</option><option value="IN_PROGRESS">進行中</option><option value="WAITING">返事待ち</option><option value="ON_HOLD">保留</option><option value="COMPLETED">完了</option></select>
                <select id="taskImportanceFilter" aria-label="重要度で絞り込み"><option value="">全重要度</option><option value="5">重要度 5</option><option value="4">重要度 4以上</option><option value="3">重要度 3以上</option></select>
                <button id="browserNotificationBtn" type="button" title="ブラウザ通知の利用状態を切り替えます">通知オフ</button>
              </div>
              <div id="dailyBrief" className="daily-brief hidden" />
              <div id="formalTaskList" className="formal-task-list"><div className="network-loading">正式タスクを確認中…</div></div>
            </section>

            <section className="conversation-focus" aria-live="polite">
              <div className="focus-meta"><span id="focusEyebrow">準備完了</span><span id="focusCounter">00 / 00</span></div>
              <div id="focusText" className="focus-text">SPACEキーでOZとのセッションを開始</div>
              <div id="focusSub" className="focus-sub">計画 / 戦略 / クリエイティブ / プロジェクト分析</div>
            </section>
            <section id="dynamicView" className="dynamic-view hidden" aria-live="polite" />
            <section id="toolApproval" className="tool-approval hidden" aria-live="assertive">
              <div><span className="eyebrow">操作の承認が必要です</span><strong id="toolApprovalTitle">接続アプリからの操作候補</strong><p id="toolApprovalCopy">外部サービスへの操作を確認してください。</p></div>
              <div><button id="toolRejectBtn" type="button">却下する</button><button id="toolApproveBtn" className="approve" type="button">承認する</button></div>
            </section>
          </section>

          <aside className="frame panel chat-panel">
            <div className="panel-heading chat-heading">
              <div><span className="eyebrow">オーナー操作</span><h2>OZ / 確認</h2></div>
              <span id="chatStatus" className="panel-meta">待機中</span>
            </div>
            <div className="thread-context"><span>スレッド</span><strong id="threadTitle">全体 / OZ</strong></div>
            <button id="networkSummary" className="network-summary" type="button" aria-label="OZ NETWORKと共有タスクを開く">
              <span className="network-summary-copy"><b id="networkStateDot" /><span><small>OZ NETWORK</small><strong id="networkStateLabel">接続状態を確認中</strong></span></span>
              <span className="network-count"><strong id="networkTaskCount">--</strong><small>未完了タスク</small></span>
            </button>
            <div className="right-panel-tabs" role="tablist" aria-label="OZ右パネル">
              <button className="active" type="button" role="tab" aria-selected="true" data-right-view="oz">OZ</button>
              <button type="button" role="tab" aria-selected="false" data-right-view="reviews">確認待ち</button>
              <button type="button" role="tab" aria-selected="false" data-right-view="approvals">承認</button>
              <button type="button" role="tab" aria-selected="false" data-right-view="activity">履歴</button>
            </div>
            <div id="chatLog" className="chat-log"><div className="chat-empty"><span className="empty-pulse" />会話ストリームの準備完了</div></div>
            <form id="ozTextForm" className="oz-text-form">
              <input id="ozTextInput" type="text" maxLength={500} placeholder="OZ、おはよう / タスク候補を相談" autoComplete="off" />
              <button type="submit">送信</button>
            </form>
            <div className="chat-composer-fake"><span>音声チャネル準備完了</span><div className="mini-wave"><i /><i /><i /><i /><i /></div></div>
          </aside>
        </main>

        <footer className="context-bar frame">
          <div className="context-left">
            <span className="context-title">現在のコンテキスト</span><span id="contextPill" className="context-pill">全体</span>
            {includeLocalDemo
              ? <span id="autoPill" className="auto-pill" data-demo-only hidden>手動</span>
              : <span id="autoPill" className="auto-pill">正式</span>}
            <div className="mode-switch" role="group" aria-label="OZのモード">
              <button id="tasksModeBtn" className="mode-btn active" type="button" aria-pressed="true">タスク</button>
              {includeLocalDemo ? <button id="demoModeBtn" className="mode-btn" type="button" aria-pressed="false" data-demo-only hidden>デモ</button> : null}
              <button id="liveModeBtn" className="mode-btn live" type="button" aria-pressed="false">LIVE OZ</button>
            </div>
            <span id="wakeStatus" className="wake-status" aria-live="polite">音声状態を確認中</span>
          </div>
          {includeLocalDemo
            ? <div className="context-center" id="contextTags" data-demo-only hidden><span className="active" data-context-tag="STRATEGY">戦略</span><span data-context-tag="CREATIVE">クリエイティブ</span><span data-context-tag="PROJECT">プロジェクト</span><span data-context-tag="NUMBERS">数値</span></div>
            : <div className="context-center" aria-hidden="true" />}
          <div className="controls">
            <button id="liveConnectBtn" className="live-connect hidden" type="button" title="マイクとRealtime音声を開始します">音声を開始</button>
            <button id="networkBtn" type="button" title="OZ NETWORKを開きます">接続</button>
            {includeLocalDemo ? <span className="demo-control-group" data-demo-only hidden>
              <button data-action="prev" title="前のデモシーンへ戻ります" aria-label="前のデモシーンへ戻る" disabled><kbd>←</kbd> 戻る</button>
              <button data-action="next" className="primary-control" title="次のデモシーンへ進みます" disabled><kbd>SPACE</kbd> 次へ</button>
              <button data-action="auto" title="デモシーンを自動再生します" aria-pressed="false" disabled><kbd>A</kbd> 自動</button>
            </span> : null}
            <button id="fullscreenBtn" type="button" title="全画面表示"><kbd>F</kbd> 全画面</button>
          </div>
        </footer>
      </div>

      <div id="projectDrawer" className="project-drawer" aria-hidden="true">
        <button className="drawer-backdrop" data-close-drawer aria-label="プロジェクト詳細を閉じる" />
        <section className="drawer-card frame">
          <div className="drawer-head">
            <div><span className="eyebrow">プロジェクト分析</span><h3 id="drawerTitle">プロジェクト</h3></div>
            <button className="drawer-close" data-close-drawer title="Escキーでも閉じられます">閉じる</button>
          </div>
          <div className="drawer-progress-wrap">
            <div className="drawer-progress-copy"><span>進捗</span><strong id="drawerProgress">0%</strong></div>
            <div className="drawer-track"><i id="drawerProgressBar" /></div>
          </div>
          <div id="drawerMeta" className="drawer-meta" />
          <div className="drawer-section"><span className="eyebrow">次のアクション</span><div id="drawerActions" className="drawer-actions" /></div>
          <div className="drawer-foot">OZプロジェクトメモリ / デモデータ</div>
        </section>
      </div>

      <div id="networkDrawer" className="network-drawer" aria-hidden="true">
        <button className="drawer-backdrop" data-close-network aria-label="OZ NETWORKを閉じる" />
        <section className="network-card frame">
          <div className="drawer-head">
            <div><span className="eyebrow">共有インテリジェンス</span><h3>OZ NETWORK</h3></div>
            <button className="drawer-close" data-close-network title="Escキーでも閉じられます">閉じる</button>
          </div>

          <div className="network-intro">
            <span>COMMAND CENTER ↔ CHATGPT ↔ 接続アプリ</span>
            <p>音声とChatGPTで共通利用する正式タスク・確認待ち基盤。外部サービスは認証完了後のみ有効になります。</p>
          </div>

          <div className="network-section">
            <div className="network-section-head"><span className="eyebrow">接続</span><button id="networkRefreshBtn" type="button" title="接続状態と正式データを再取得します">更新</button></div>
            <div id="integrationList" className="integration-list"><div className="network-loading">安全な接続を確認中…</div></div>
          </div>

          <div className="network-section business-section">
            <div className="network-section-head"><span className="eyebrow">事業一覧</span><span id="businessMeta">0 稼働中</span></div>
            <div id="businessList" className="business-list"><div className="network-loading">事業マスターを読み込み中…</div></div>
          </div>

          <div className="network-section task-section">
            <div className="network-section-head"><span className="eyebrow">共有OZタスク</span><span id="sharedTaskMeta">0 未完了</span></div>
            <form id="quickTaskForm" className="quick-task-form">
              <input id="quickTaskInput" name="title" type="text" maxLength={180} placeholder="確認待ちタスク候補を追加" autoComplete="off" />
              <button type="submit">追加</button>
            </form>
            <div id="quickTaskFeedback" className="review-feedback" role="status" aria-live="polite" />
            <div className="task-review-layout">
              <div className="network-review-sticky">
                <div className="network-section-head review-section-head"><span className="eyebrow">確認待ち</span><span id="reviewMeta">0 確認待ち</span></div>
                <div id="reviewBulkToolbar" className="review-bulk-toolbar" aria-label="プロジェクト候補の一括操作">
                  <div className="review-bulk-selection">
                    <button id="reviewSelectAllBtn" type="button">0件すべて選択</button>
                    <button id="reviewClearSelectionBtn" type="button">選択解除</button>
                    <span id="reviewSelectionCount" role="status" aria-live="polite">0件選択中</span>
                  </div>
                  <div className="review-bulk-actions">
                    <button id="reviewBulkApproveBtn" type="button" data-batch-decision="APPROVED" disabled>一括承認</button>
                    <button id="reviewBulkNeedsEditBtn" type="button" data-batch-decision="NEEDS_EDIT" disabled>一括要修正</button>
                    <button id="reviewBulkRejectBtn" type="button" data-batch-decision="REJECTED" disabled>一括却下</button>
                  </div>
                </div>
              </div>
              <div className="task-review-scroll" tabIndex={0} aria-label="確認待ち候補と正式タスクの一覧">
                <div id="reviewList" className="review-list"><div className="network-loading">確認待ちを読み込み中…</div></div>
                <div className="network-section-head formal-task-head"><span className="eyebrow">正式タスク</span></div>
                <div id="sharedTaskList" className="shared-task-list"><div className="network-loading">共有タスクを読み込み中…</div></div>
              </div>
            </div>
          </div>

          <div className="network-foot"><span>読み取り：自動</span><span>書き込み：必ず確認</span></div>
        </section>
      </div>

      <section id="reviewBatchDialog" className="review-batch-dialog hidden" role="dialog" aria-modal="true" aria-labelledby="reviewBatchTitle" aria-describedby="reviewBatchImpact">
        <div className="review-batch-card frame">
          <span className="eyebrow">最終確認</span>
          <h3 id="reviewBatchTitle">一括操作を確認</h3>
          <dl className="review-batch-summary">
            <div><dt>操作</dt><dd id="reviewBatchOperation">—</dd></div>
            <div><dt>選択件数</dt><dd id="reviewBatchCount">0件</dd></div>
          </dl>
          <div className="review-batch-targets">
            <strong>対象</strong>
            <ul id="reviewBatchNames" />
          </div>
          <p id="reviewBatchImpact">承認した候補は正式projectsへ登録されます。初期タスク候補8件は自動作成されません。</p>
          <div id="reviewBatchResult" className="review-batch-result" role="status" aria-live="polite" />
          <div className="review-batch-dialog-actions">
            <button id="reviewBatchCancelBtn" type="button">戻る</button>
            <button id="reviewBatchConfirmBtn" className="approve" type="button">実行する</button>
          </div>
        </div>
      </section>

      <div id="taskDrawer" className="task-drawer" aria-hidden="true">
        <button className="drawer-backdrop" data-close-task-drawer aria-label="タスク詳細を閉じる" />
        <section className="task-drawer-card frame">
          <div className="drawer-head">
            <div><span className="eyebrow" id="taskDrawerEyebrow">正式タスク</span><h3 id="taskDrawerTitle">タスク</h3></div>
            <button className="drawer-close" data-close-task-drawer title="Escキーでも閉じられます">閉じる</button>
          </div>
          <div id="taskDrawerBody" className="task-drawer-body" />
          <form id="taskCandidateForm" className="task-candidate-form hidden">
            <label><span>タイトル</span><input name="title" maxLength={180} required /></label>
            <label><span>プロジェクト</span><select name="projectId"><option value="">プロジェクトなし</option></select></label>
            <div className="form-grid">
              <label><span>重要度</span><select name="importance" defaultValue="3"><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option></select></label>
              <label><span>見積時間（分）</span><input name="estimatedMinutes" type="number" min="0" max="100000" /></label>
              <label><span>期限（JST）</span><input name="dueAt" type="datetime-local" /></label>
              <label><span>実行環境</span><select name="executionEnvironment" defaultValue="ANY"><option value="ANY">指定なし</option><option value="MOBILE">モバイル</option><option value="PC">PC</option><option value="TRAVEL_OK">移動中可</option><option value="CALL">電話</option><option value="IN_PERSON">対面</option></select></label>
              <label><span>時間区分</span><select name="timeLane" defaultValue="SOMEDAY"><option value="DUE">期限指定</option><option value="TODAY_IF_POSSIBLE">できれば今日</option><option value="SOMEDAY">いつか</option></select></label>
              <label><span>委任状態</span><select name="delegationState" defaultValue="SELF"><option value="SELF">自分</option><option value="CANDIDATE">委任候補</option><option value="DELEGATED">委任済み</option></select></label>
            </div>
            <div className="form-grid">
              <label><span>担当者</span><input name="assigneeLabel" maxLength={180} /></label>
              <label><span>委任先</span><input name="delegateLabel" maxLength={180} /></label>
            </div>
            <label><span>説明</span><textarea name="description" maxLength={10000} /></label>
            <label><span>停滞理由</span><textarea name="blockReason" maxLength={2000} /></label>
            <label className="candidate-check"><input name="travelAllowed" type="checkbox" /><span>移動中の対応可</span></label>
            <div id="taskCandidateFeedback" className="review-feedback" role="status" />
            <button className="candidate-submit" type="submit">確認待ち候補を作成</button>
          </form>
        </section>
      </div>

      <div id="candidateDrawer" className="candidate-drawer" aria-hidden="true">
        <button className="drawer-backdrop" data-close-candidate-drawer aria-label="候補一覧を閉じる" />
        <section className="candidate-drawer-card frame">
          <div className="drawer-head">
            <div><span className="eyebrow">確認待ち専用</span><h3>初期候補</h3></div>
            <button className="drawer-close" data-close-candidate-drawer title="Escキーでも閉じられます">閉じる</button>
          </div>
          <p className="candidate-intro">プロジェクトを1件ずつ確認待ちへ追加します。クライアントの初期タスクは、対象プロジェクトの承認後にだけ選択できます。</p>
          <form id="initialCandidateForm">
            <section id="initialTaskBulkToolbar" className="initial-task-bulk-toolbar" aria-label="初期タスク候補の一括選択">
              <div className="initial-task-bulk-head">
                <span className="eyebrow">タスク候補</span>
                <span id="initialTaskSelectionCount" role="status" aria-live="polite">選択中 0/8件</span>
              </div>
              <div className="initial-task-bulk-controls">
                <button id="initialTaskSelectAllBtn" type="button">対象タスクをすべて選択</button>
                <button id="initialTaskClearSelectionBtn" type="button" disabled>選択解除</button>
                <button id="initialTaskSubmitBtn" className="initial-task-review-open" type="button" disabled>選択したタスクを確認</button>
              </div>
            </section>
            <div id="initialCandidateList" className="initial-candidate-list" />
            <div id="initialCandidateFeedback" className="review-feedback" role="status" />
            <button className="candidate-submit" type="submit">選択したプロジェクト候補を確認待ちへ送る</button>
          </form>
          <section className="legacy-candidate-box">
            <span className="eyebrow">読み取り専用 LEGACY D1</span>
            <div id="legacyCandidateList" className="legacy-candidate-list"><div className="network-loading">旧データ一覧を読み込み中…</div></div>
            <small>非公開項目は非表示 / 自動移行なし</small>
          </section>
        </section>
      </div>

      <section id="initialTaskConfirmDialog" className="review-batch-dialog hidden" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="initialTaskConfirmTitle" aria-describedby="initialTaskConfirmImpact">
        <div className="review-batch-card frame initial-task-confirm-card">
          <span className="eyebrow">最終確認</span>
          <h3 id="initialTaskConfirmTitle">初期タスク候補を確認</h3>
          <dl className="review-batch-summary">
            <div><dt>操作</dt><dd>確認待ちへ追加</dd></div>
            <div><dt>選択件数</dt><dd id="initialTaskConfirmCount">0件</dd></div>
          </dl>
          <div className="review-batch-targets initial-task-confirm-targets">
            <strong>タスク / プロジェクト</strong>
            <ul id="initialTaskConfirmList" />
          </div>
          <p id="initialTaskConfirmImpact">各タスクを1件ずつTASK_CREATE / PENDINGとして追加します。この操作だけでは正式タスクは作成されません。</p>
          <div id="initialTaskConfirmFeedback" className="review-batch-result" role="status" aria-live="polite" />
          <div className="review-batch-dialog-actions">
            <button id="initialTaskConfirmCancelBtn" type="button">戻る</button>
            <button id="initialTaskConfirmSubmitBtn" className="approve" type="button">確認待ちへ追加</button>
          </div>
        </div>
      </section>

      <SupabaseAuth />
      <OzScripts includeLocalDemo={includeLocalDemo} />
    </>
  );
}

export default function Home() {
  return <OzCommandCenter />;
}
