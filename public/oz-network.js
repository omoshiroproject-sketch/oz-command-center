(() => {
  'use strict';

  if (window.OZ_NETWORK?.initialized) return;

  const $ = (id) => document.getElementById(id);
  const els = {
    drawer: $('networkDrawer'),
    summary: $('networkSummary'),
    networkBtn: $('networkBtn'),
    refreshBtn: $('networkRefreshBtn'),
    stateDot: $('networkStateDot'),
    stateLabel: $('networkStateLabel'),
    taskCount: $('networkTaskCount'),
    integrationList: $('integrationList'),
    businessList: $('businessList'),
    businessMeta: $('businessMeta'),
    sharedTaskList: $('sharedTaskList'),
    sharedTaskMeta: $('sharedTaskMeta'),
    quickTaskForm: $('quickTaskForm'),
    quickTaskInput: $('quickTaskInput'),
    quickTaskFeedback: $('quickTaskFeedback'),
    reviewList: $('reviewList'),
    reviewMeta: $('reviewMeta'),
    reviewBulkToolbar: $('reviewBulkToolbar'),
    reviewSelectAllBtn: $('reviewSelectAllBtn'),
    reviewClearSelectionBtn: $('reviewClearSelectionBtn'),
    reviewSelectionCount: $('reviewSelectionCount'),
    reviewBulkApproveBtn: $('reviewBulkApproveBtn'),
    reviewBulkRejectBtn: $('reviewBulkRejectBtn'),
    reviewBulkNeedsEditBtn: $('reviewBulkNeedsEditBtn'),
    reviewBatchDialog: $('reviewBatchDialog'),
    reviewBatchTitle: $('reviewBatchTitle'),
    reviewBatchOperation: $('reviewBatchOperation'),
    reviewBatchCount: $('reviewBatchCount'),
    reviewBatchNames: $('reviewBatchNames'),
    reviewBatchImpact: $('reviewBatchImpact'),
    reviewBatchResult: $('reviewBatchResult'),
    reviewBatchCancelBtn: $('reviewBatchCancelBtn'),
    reviewBatchConfirmBtn: $('reviewBatchConfirmBtn')
  };

  const state = { integrations: [], projects: [], tasks: [], reviews: [], auditLogs: [], externalActions: [], actionApprovals: [], legacyCandidates: null, loading: false };
  const reviewActionInFlight = new Set();
  const selectedReviewIds = new Set();
  const batchRuns = new Map();
  let pendingBatchPlan = null;
  let batchDialogBusy = false;
  const taskStatusInFlight = new Set();
  const escapeHtml = (value='') => String(value).replace(/[&<>'"]/g, (char) => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#039;', '"':'&quot;'
  }[char]));
  const displayLabels = {
    ACTIVE:'稼働中', ARCHIVED:'アーカイブ', PLANNED:'計画中', UNSTARTED:'未着手', IN_PROGRESS:'進行中',
    WAITING:'待機', ON_HOLD:'保留', COMPLETED:'完了', PENDING:'確認待ち', NEEDS_EDIT:'要修正',
    APPROVED:'承認済み', REJECTED:'却下', ANY:'指定なし', MOBILE:'モバイル', PC:'PC',
    TRAVEL_OK:'移動中可', CALL:'電話', IN_PERSON:'対面', QUICK_ADD:'クイック追加', VOICE:'音声', MANUAL:'手動',
  };
  const label = (value='') => displayLabels[String(value).toUpperCase()] || String(value).replaceAll('_', ' ');
  const reviewDecisions = new Set(['APPROVED', 'REJECTED', 'NEEDS_EDIT']);
  const decisionLabel = (decision) => decision === 'APPROVED' ? '承認' : decision === 'REJECTED' ? '却下' : '要修正';

  function safeError(code, status=0) {
    const error = new Error(code);
    error.code = code;
    if (status) error.status = status;
    return error;
  }

  function measure(method, ...args) {
    try { return window.OZ_LATENCY?.[method]?.(...args) ?? null; }
    catch { return null; }
  }

  function reviewName(review={}) {
    const candidate = review.candidate_data || {};
    return String(candidate.title || candidate.name || (review.kind === 'TASK_STATUS_CHANGE' && candidate.status ? `ステータスを${label(candidate.status)}へ変更` : '内容未設定の候補'));
  }

  function bulkEligibleReviews() {
    return state.reviews.filter((review) => review.kind === 'PROJECT_CREATE' && review.status === 'PENDING' && !reviewActionInFlight.has(review.id));
  }

  function openDrawer() {
    els.drawer?.classList.add('open');
    els.drawer?.setAttribute('aria-hidden', 'false');
    void refresh({allowSignIn:true});
  }

  function closeDrawer() {
    els.drawer?.classList.remove('open');
    els.drawer?.setAttribute('aria-hidden', 'true');
  }

  function renderIntegrations() {
    if (!els.integrationList) return;
    if (!state.integrations.length) {
      els.integrationList.innerHTML = '<div class="network-loading">接続情報はありません。</div>';
      return;
    }
    els.integrationList.innerHTML = state.integrations.map((item) => {
      const status = item.state === 'connected' ? '接続済み' : item.state === 'configured' ? '認証準備済み' : '設定';
      const css = item.state === 'connected' ? 'connected' : item.state === 'configured' ? 'configured' : 'pending';
      return `<div class="integration-row ${css}">
        <span class="integration-dot"></span>
        <span class="integration-copy"><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.adapter || 'server-side')}</small></span>
        <span class="integration-status">${status}</span>
      </div>`;
    }).join('');
  }

  function compactDate(value) {
    return String(value || '').replaceAll('-', '.');
  }

  function renderProjects() {
    if (els.businessMeta) {
      const active = state.projects.filter((project) => !['COMPLETED', 'ARCHIVED'].includes(project.formalStatus)).length;
      els.businessMeta.textContent = `${active} 稼働中`;
    }
    if (!els.businessList) return;
    if (!state.projects.length) {
      els.businessList.innerHTML = '<div class="network-empty">事業マスターはまだ登録されていません。</div>';
      return;
    }

    els.businessList.innerHTML = state.projects.map((project) => `<article class="business-card">
        <div class="business-card-head">
          <span><strong>${escapeHtml(project.name)}</strong><small>正式プロジェクト</small></span>
          <b class="confirmed">${escapeHtml(label(project.formalStatus || 'ACTIVE'))}</b>
        </div>
        <p>${escapeHtml(project.description || '説明は未設定です。')}</p>
        <div class="business-milestones"><span><small>重要度</small><strong>${Number(project.importance || 3)}</strong></span><span><small>目標日</small><strong>${escapeHtml(project.targetDate || '未設定')}</strong></span><span><small>データ元</small><strong>POSTGRESQL</strong></span></div>
      </article>`).join('');
  }

  function renderTasks() {
    const openTasks = state.tasks.filter((task) => task.formalStatus !== 'COMPLETED');
    if (els.taskCount) els.taskCount.textContent = String(openTasks.length).padStart(2, '0');
    if (els.sharedTaskMeta) els.sharedTaskMeta.textContent = `${openTasks.length} 未完了`;
    if (!els.sharedTaskList) return;

    if (!state.tasks.length) {
      els.sharedTaskList.innerHTML = '<div class="network-empty">共通タスクはまだありません。音声で「OZ、タスクに追加して」でも登録できます。</div>';
      return;
    }

    els.sharedTaskList.innerHTML = state.tasks.slice(0, 12).map((task) => {
      const pendingStatusReview = state.reviews.some((review) => {
        const candidate = review.candidate_data || {};
        return review.kind === 'TASK_STATUS_CHANGE' && ['PENDING','NEEDS_EDIT'].includes(review.status)
          && (review.target_id || candidate.taskId) === task.id;
      });
      const statusLocked = task.formalStatus === 'COMPLETED' || pendingStatusReview || taskStatusInFlight.has(task.id);
      return `<div class="shared-task ${task.formalStatus === 'COMPLETED' ? 'done' : ''}">
      <button type="button" data-complete-task="${escapeHtml(task.id)}" aria-label="${pendingStatusReview ? 'ステータス変更は確認待ちです' : task.formalStatus === 'COMPLETED' ? '完了済み' : '完了への変更を確認待ちへ追加'}" ${statusLocked ? 'disabled' : ''}></button>
      <span><strong>${escapeHtml(task.title)}</strong><small>${escapeHtml(task.projectName || task.formalStatus || 'OZ')}</small></span>
    </div>`;
    }).join('');

    els.sharedTaskList.querySelectorAll('[data-complete-task]').forEach((button) => {
      button.addEventListener('click', async () => {
        const taskId = button.dataset.completeTask;
        if (!taskId || taskStatusInFlight.has(taskId) || button.disabled) return;
        taskStatusInFlight.add(taskId);
        button.disabled = true;
        try {
          await executeTool('oz_propose_task_status_change', { taskId, status:'COMPLETED' }, {sourceType:'MANUAL'});
          feedback('ステータス変更を確認待ちへ追加しました', 'success');
        }
        catch (error) { console.error(error); button.disabled = false; }
        finally { taskStatusInFlight.delete(taskId); }
      });
    });
  }

  function feedback(message='', tone='') {
    if (!els.quickTaskFeedback) return;
    els.quickTaskFeedback.textContent = message;
    els.quickTaskFeedback.dataset.tone = tone;
  }

  function reviewDetails(candidate={}) {
    const details = [];
    if (candidate.status) details.push(label(candidate.status));
    if (candidate.targetDate) details.push(`目標日 ${compactDate(candidate.targetDate)}`);
    if (candidate.dueAt) details.push(`期限 ${compactDate(String(candidate.dueAt).slice(0, 10))}`);
    if (candidate.estimatedMinutes != null) details.push(`${Number(candidate.estimatedMinutes)}分`);
    if (candidate.importance != null) details.push(`重要度 ${Number(candidate.importance)}`);
    return details.join(' / ') || '詳細未設定';
  }

  function reviewResolutionKey(review, decision) {
    const version = Number.isInteger(review?.version) ? review.version : 1;
    return `review-resolve:${review.id}:${version}:${decision}:v1`;
  }

  function syncReviewSelection() {
    const eligibleIds = new Set(bulkEligibleReviews().map((review) => review.id));
    for (const reviewId of selectedReviewIds) if (!eligibleIds.has(reviewId)) selectedReviewIds.delete(reviewId);
  }

  function updateBulkControls() {
    syncReviewSelection();
    const eligible = bulkEligibleReviews();
    const selected = selectedReviewIds.size;
    if (els.reviewSelectAllBtn) els.reviewSelectAllBtn.textContent = `${eligible.length}件すべて選択`;
    if (els.reviewSelectionCount) els.reviewSelectionCount.textContent = `${selected}件選択中`;
    if (els.reviewSelectAllBtn) els.reviewSelectAllBtn.disabled = eligible.length === 0 || selected === eligible.length;
    if (els.reviewClearSelectionBtn) els.reviewClearSelectionBtn.disabled = selected === 0;
    [els.reviewBulkApproveBtn, els.reviewBulkRejectBtn, els.reviewBulkNeedsEditBtn].forEach((button) => {
      if (button) button.disabled = selected === 0 || batchDialogBusy;
    });
    if (els.reviewBulkToolbar) els.reviewBulkToolbar.hidden = false;
  }

  function notifyReviewSelectionChanged() {
    window.dispatchEvent(new CustomEvent('oz:review-selection-changed', {
      detail:{selectedCount:selectedReviewIds.size, eligibleCount:bulkEligibleReviews().length}
    }));
  }

  function bindReviewScrollKeyboard() {
    const container = typeof els.reviewList?.closest === 'function' ? els.reviewList.closest('.task-review-scroll') : null;
    if (!container || container.dataset.keyboardScrollBound === 'true') return;
    container.dataset.keyboardScrollBound = 'true';
    container.addEventListener('keydown', (event) => {
      const page = Math.max(120, Math.floor(container.clientHeight * 0.85));
      if (event.key === 'PageDown') { event.preventDefault(); container.scrollBy({top:page, behavior:'auto'}); }
      else if (event.key === 'PageUp') { event.preventDefault(); container.scrollBy({top:-page, behavior:'auto'}); }
      else if (event.key === 'Home') { event.preventDefault(); container.scrollTo({top:0, behavior:'auto'}); }
      else if (event.key === 'End') { event.preventDefault(); container.scrollTo({top:container.scrollHeight, behavior:'auto'}); }
    });
  }

  function selectAllPendingReviews() {
    bulkEligibleReviews().forEach((review) => selectedReviewIds.add(review.id));
    renderReviews();
    notifyReviewSelectionChanged();
    return selectedReviewIds.size;
  }

  function clearReviewSelection() {
    selectedReviewIds.clear();
    renderReviews();
    notifyReviewSelectionChanged();
    return 0;
  }

  function toggleReviewSelection(reviewId, selected) {
    const eligible = bulkEligibleReviews().some((review) => review.id === reviewId);
    if (!eligible) return false;
    if (selected) selectedReviewIds.add(reviewId); else selectedReviewIds.delete(reviewId);
    updateBulkControls();
    notifyReviewSelectionChanged();
    return true;
  }

  function prepareReviewBatch({decision, reviewIds}={}) {
    if (!reviewDecisions.has(decision)) throw new Error('INVALID_REVIEW_DECISION');
    const requested = Array.isArray(reviewIds) ? new Set(reviewIds) : null;
    const reviews = bulkEligibleReviews().filter((review) => !requested || requested.has(review.id));
    if (!reviews.length) throw new Error('NO_PENDING_PROJECT_REVIEWS');
    return Object.freeze({
      id: crypto.randomUUID(),
      kind: 'PROJECT_CREATE',
      status: 'PENDING',
      decision,
      reviewIds: Object.freeze(reviews.map((review) => review.id)),
      names: Object.freeze(reviews.map(reviewName)),
      count: reviews.length
    });
  }

  function renderBatchConfirmation(plan) {
    if (!plan || !els.reviewBatchDialog) return;
    const operation = decisionLabel(plan.decision);
    if (els.reviewBatchTitle) els.reviewBatchTitle.textContent = `${plan.count}件の${operation}を確認`;
    if (els.reviewBatchOperation) els.reviewBatchOperation.textContent = operation;
    if (els.reviewBatchCount) els.reviewBatchCount.textContent = `${plan.count}件`;
    if (els.reviewBatchNames) els.reviewBatchNames.innerHTML = plan.names.map((name) => `<li>${escapeHtml(name)}</li>`).join('');
    if (els.reviewBatchImpact) {
      els.reviewBatchImpact.textContent = plan.decision === 'APPROVED'
        ? '承認した候補は正式projectsへ登録されます。初期タスク候補8件は自動作成されません。'
        : `${operation}では正式projectsを作成しません。初期タスク候補8件も自動作成されません。`;
    }
    if (els.reviewBatchResult) { els.reviewBatchResult.textContent = ''; delete els.reviewBatchResult.dataset.tone; }
    if (els.reviewBatchConfirmBtn) {
      els.reviewBatchConfirmBtn.textContent = `${plan.count}件を${operation}する`;
      els.reviewBatchConfirmBtn.disabled = false;
    }
    if (els.reviewBatchCancelBtn) { els.reviewBatchCancelBtn.textContent = '戻る'; els.reviewBatchCancelBtn.disabled = false; }
    els.reviewBatchDialog.classList.remove('hidden');
    els.reviewBatchConfirmBtn?.focus?.();
  }

  function openBatchConfirmation(decision, reviewIds=[...selectedReviewIds]) {
    if (batchDialogBusy) return null;
    try {
      pendingBatchPlan = prepareReviewBatch({decision, reviewIds});
      renderBatchConfirmation(pendingBatchPlan);
      return pendingBatchPlan;
    } catch {
      feedback('操作可能な確認待ちプロジェクト候補を選択してください。', 'error');
      return null;
    }
  }

  function closeBatchConfirmation() {
    if (batchDialogBusy) return false;
    pendingBatchPlan = null;
    els.reviewBatchDialog?.classList.add('hidden');
    return true;
  }

  function validateReviewResolutionPayload(payload, review, decision) {
    const result = payload?.result;
    const outcome = result?.data?.outcome;
    if (result?.ok !== true || result?.code !== 'REVIEW_RESOLVED'
      || !outcome || outcome.reviewId !== review.id || outcome.status !== decision
      || typeof outcome.replayed !== 'boolean') {
      throw safeError('INVALID_REVIEW_RESOLUTION_RESPONSE');
    }
    return outcome;
  }

  async function postReviewResolution(review, decision, {sourceType='MANUAL'}={}) {
    if (!review || !reviewDecisions.has(decision)) throw new Error('INVALID_REVIEW_RESOLUTION');
    const payload = await requestJson(`/api/oz/reviews/${encodeURIComponent(review.id)}/resolve`, {
      method:'POST',
      headers:{
        'content-type':'application/json',
        'idempotency-key':reviewResolutionKey(review, decision),
        'x-oz-explicit-approval':'true',
        'x-oz-tool-source':sourceType
      },
      body:JSON.stringify({ decision })
    });
    return validateReviewResolutionPayload(payload, review, decision);
  }

  function resolutionMatchesContext(context, reviewId, decision) {
    const resolved = context?.reviews?.find((review) => review.id === reviewId);
    return resolved?.status === decision;
  }

  async function executeVerifiedReviewResolutions(reviews, decision, {sourceType='MANUAL', measurementSequence=null}={}) {
    if (!Array.isArray(reviews) || !reviews.length || !reviewDecisions.has(decision)) throw safeError('INVALID_REVIEW_RESOLUTION');
    const lockedReviewIds = [];
    const results = [];
    let requestAttempted = false;
    let networkMeasurementStarted = false;
    try {
      for (const review of reviews) {
        const name = reviewName(review);
        if (!review?.id || !['PENDING','NEEDS_EDIT'].includes(review.status)) {
          results.push({reviewId:review?.id || '', name, ok:false, apiAccepted:false, code:'REVIEW_NOT_PENDING'});
          continue;
        }
        if (reviewActionInFlight.has(review.id)) {
          results.push({reviewId:review.id, name, ok:false, apiAccepted:false, code:'REVIEW_IN_FLIGHT'});
          continue;
        }
        reviewActionInFlight.add(review.id);
        lockedReviewIds.push(review.id);
        requestAttempted = true;
        if (!networkMeasurementStarted) {
          measure('toolNetworkStarted', measurementSequence);
          networkMeasurementStarted = true;
        }
        try {
          const outcome = await postReviewResolution(review, decision, {sourceType});
          results.push({reviewId:review.id, name, ok:false, apiAccepted:true, replayed:outcome.replayed, code:'SERVER_CONFIRMATION_PENDING'});
        } catch (error) {
          results.push({reviewId:review.id, name, ok:false, apiAccepted:false, code:String(error?.code || `HTTP_${error?.status || 'ERROR'}`)});
        }
      }

      if (networkMeasurementStarted) {
        const networkSucceeded = results.filter((result) => result.apiAccepted !== undefined).every((result) => result.apiAccepted);
        measure('toolNetworkFinished', measurementSequence, networkSucceeded ? 'success' : 'failed');
      }

      let context = null;
      let contextError = null;
      if (requestAttempted) {
        measure('contextRefreshStarted', measurementSequence);
        try {
          context = await refreshContextStrict();
          measure('contextRefreshFinished', measurementSequence, 'success');
        }
        catch {
          measure('contextRefreshFinished', measurementSequence, 'failed');
          contextError = safeError('CONTEXT_VERIFICATION_FAILED');
        }
      } else renderReviews();

      for (const result of results) {
        if (!result.apiAccepted) continue;
        if (contextError) {
          result.code = contextError.code;
          continue;
        }
        if (!resolutionMatchesContext(context, result.reviewId, decision)) {
          result.code = 'SERVER_STATE_NOT_RESOLVED';
          continue;
        }
        result.ok = true;
        result.code = result.replayed ? 'RESOLVED_REPLAY' : 'RESOLVED';
        selectedReviewIds.delete(result.reviewId);
      }
    } finally {
      lockedReviewIds.forEach((reviewId) => reviewActionInFlight.delete(reviewId));
    }
    return results.map((result) => ({reviewId:result.reviewId, name:result.name, ok:result.ok, code:result.code}));
  }

  async function executeReviewResolution(reviewId, decision, {sourceType='MANUAL'}={}) {
    const review = state.reviews.find((item) => item.id === reviewId && ['PENDING','NEEDS_EDIT'].includes(item.status));
    if (!review) throw safeError('REVIEW_NOT_PENDING');
    const [result] = await executeVerifiedReviewResolutions([review], decision, {sourceType});
    if (!result?.ok) throw safeError(result?.code || 'REVIEW_RESOLUTION_FAILED');
    return result;
  }

  async function executeReviewBatch(plan, {sourceType='MANUAL', measurementSequence=null}={}) {
    if (!plan || plan.kind !== 'PROJECT_CREATE' || plan.status !== 'PENDING' || !reviewDecisions.has(plan.decision)) throw new Error('INVALID_REVIEW_BATCH');
    const existing = batchRuns.get(plan.id);
    if (existing) return existing;
    const run = (async () => {
      const missing = [];
      const reviews = [];
      for (const reviewId of plan.reviewIds) {
        const review = state.reviews.find((item) => item.id === reviewId && item.kind === 'PROJECT_CREATE' && item.status === 'PENDING');
        const name = review ? reviewName(review) : plan.names[plan.reviewIds.indexOf(reviewId)] || '対象候補';
        if (review) reviews.push(review);
        else missing.push({reviewId, name, ok:false, code:'REVIEW_NOT_PENDING'});
      }
      const verified = reviews.length ? await executeVerifiedReviewResolutions(reviews, plan.decision, {sourceType, measurementSequence}) : [];
      const byId = new Map([...verified, ...missing].map((result) => [result.reviewId, result]));
      const results = plan.reviewIds.map((reviewId) => byId.get(reviewId));
      const successCount = results.filter((result) => result.ok).length;
      const failureCount = results.length - successCount;
      return {total:results.length, successCount, failureCount, results};
    })();
    batchRuns.set(plan.id, run);
    return run;
  }

  function renderBatchResult(result) {
    if (!els.reviewBatchResult) return;
    const summary = result.successCount === 0
      ? `全件失敗 ${result.failureCount}件`
      : `成功 ${result.successCount}件 / 失敗 ${result.failureCount}件`;
    els.reviewBatchResult.dataset.tone = result.failureCount ? 'error' : 'success';
    els.reviewBatchResult.innerHTML = `<strong>${escapeHtml(summary)}</strong><ul>${result.results.map((item) => `<li>${escapeHtml(item.name)}：${item.ok ? '完了' : `失敗（${item.code}）`}</li>`).join('')}</ul>`;
  }

  function renderReviews(reviews=state.reviews) {
    if (reviews !== state.reviews) state.reviews = reviews;
    const actionable = reviews.filter((review) => review.status === 'PENDING' || review.status === 'NEEDS_EDIT');
    const pending = actionable.filter((review) => review.status === 'PENDING').length;
    const needsEdit = actionable.length - pending;
    if (els.reviewMeta) els.reviewMeta.textContent = needsEdit ? `${pending} 確認待ち / ${needsEdit} 要修正` : `${pending} 確認待ち`;
    if (!els.reviewList) return;
    bindReviewScrollKeyboard();
    if (!actionable.length) {
      els.reviewList.innerHTML = '<div class="network-empty">確認待ち候補はありません。</div>';
      updateBulkControls();
      return;
    }

    els.reviewList.innerHTML = actionable.map((review) => {
      const candidate = review.candidate_data || {};
      const title = reviewName(review);
      const source = label(review.source_type || 'OZ');
      const status = label(review.status || 'PENDING');
      const selectable = review.kind === 'PROJECT_CREATE' && review.status === 'PENDING';
      const selection = selectable
        ? `<label class="review-select"><input type="checkbox" data-review-select="${escapeHtml(review.id)}" aria-label="${escapeHtml(title)}を選択" ${selectedReviewIds.has(review.id) ? 'checked' : ''}></label>`
        : '';
      const needsEditButton = review.status === 'PENDING'
        ? `<button type="button" data-review-id="${escapeHtml(review.id)}" data-review-decision="NEEDS_EDIT">要修正</button>`
        : '';
      return `<article class="review-item ${selectable ? 'selectable' : ''}" data-review-id="${escapeHtml(review.id)}">
        ${selection}
        <div class="review-content">
          <div class="review-copy">
            <span><b>${escapeHtml(status)}</b><small>${escapeHtml(source)}</small></span>
            <strong>${escapeHtml(title)}</strong>
            ${candidate.description ? `<p>${escapeHtml(candidate.description)}</p>` : ''}
            <small>${escapeHtml(reviewDetails(candidate))}</small>
          </div>
          <div class="review-actions">
            <button type="button" class="approve" data-review-id="${escapeHtml(review.id)}" data-review-decision="APPROVED">承認する</button>
            ${needsEditButton}
            <button type="button" data-review-id="${escapeHtml(review.id)}" data-review-decision="REJECTED">却下する</button>
          </div>
        </div>
      </article>`;
    }).join('');

    els.reviewList.querySelectorAll('[data-review-select]').forEach((checkbox) => {
      checkbox.addEventListener('change', () => { toggleReviewSelection(checkbox.dataset.reviewSelect, checkbox.checked); });
    });

    els.reviewList.querySelectorAll('[data-review-decision]').forEach((button) => {
      button.addEventListener('click', async () => {
        const reviewId = button.dataset.reviewId;
        const decision = button.dataset.reviewDecision;
        const review = state.reviews.find((item) => item.id === reviewId && ['PENDING','NEEDS_EDIT'].includes(item.status));
        if (!review || !reviewDecisions.has(decision) || reviewActionInFlight.has(reviewId)) return;
        const cardButtons = button.closest('.review-item')?.querySelectorAll('[data-review-decision]') || [button];
        cardButtons.forEach((item) => { item.disabled = true; });
        feedback('確認操作を処理しています。');
        try {
          await executeReviewResolution(review.id, decision);
          const message = decision === 'APPROVED'
            ? '承認しました。候補の種類に応じて正式データへ反映しました。'
            : decision === 'REJECTED' ? '候補を却下しました。' : '候補を修正待ちにしました。';
          feedback(message, 'success');
        } catch {
          feedback('確認操作を完了できませんでした。再読み込みして状態を確認してください。', 'error');
          cardButtons.forEach((item) => { item.disabled = false; });
        }
      });
    });
    updateBulkControls();
  }

  function renderSummary() {
    const ready = state.integrations.filter((item) => item.state === 'connected' || item.state === 'configured').length;
    const total = state.integrations.length || 0;
    if (els.stateLabel) els.stateLabel.textContent = total ? `${ready}/${total} 接続準備済み` : 'コアを初期化中';
    if (els.stateDot) els.stateDot.classList.toggle('ready', ready > 0);
  }

  function render() {
    renderIntegrations();
    renderProjects();
    renderReviews();
    renderTasks();
    renderSummary();
    window.dispatchEvent(new CustomEvent('oz:network-updated', { detail: { ...state } }));
  }

  async function requestJson(url, options={}) {
    await window.OZ_AUTH?.waitUntilReady?.();
    const accessToken = await window.OZ_AUTH?.getAccessToken?.();
    const headers = new Headers(options.headers || {});
    if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
    const response = await fetch(url, { cache:'no-store', ...options, headers });
    let payload;
    try { payload = await response.json(); }
    catch {
      if (response.ok) throw safeError('INVALID_JSON_RESPONSE', response.status);
      payload = {};
    }
    if (!response.ok) {
      throw safeError(payload?.error?.code || `HTTP_${response.status}`, response.status);
    }
    return payload;
  }

  function applyContextPayload(payload) {
    if (!payload || !Array.isArray(payload.projects) || !Array.isArray(payload.tasks) || !Array.isArray(payload.reviews)) {
      throw safeError('INVALID_CONTEXT_RESPONSE');
    }
    state.integrations = Array.isArray(payload.integrations) ? payload.integrations : [];
    state.projects = payload.projects;
    state.tasks = payload.tasks;
    state.reviews = payload.reviews;
    state.auditLogs = Array.isArray(payload.auditLogs) ? payload.auditLogs : [];
    state.externalActions = Array.isArray(payload.externalActions) ? payload.externalActions : [];
    state.actionApprovals = Array.isArray(payload.actionApprovals) ? payload.actionApprovals : [];
    state.legacyCandidates = payload.legacyCandidates || null;
    return payload;
  }

  async function refreshContextStrict() {
    const payload = applyContextPayload(await requestJson('/api/oz/context'));
    render();
    return payload;
  }

  async function refresh({allowSignIn=false, measurementSequence=null}={}) {
    if (state.loading) {
      measure('contextRefreshStarted', measurementSequence);
      measure('contextRefreshFinished', measurementSequence, 'cancelled');
      return state;
    }
    state.loading = true;
    let measurementOutcome = 'success';
    measure('contextRefreshStarted', measurementSequence);
    try {
      applyContextPayload(await requestJson('/api/oz/context'));
    } catch (error) {
      measurementOutcome = 'failed';
      if (allowSignIn && error?.status === 401 && window.OZ_AUTH?.configured) {
        await window.OZ_AUTH.signIn();
        return state;
      }
      try {
        const fallback = await requestJson('/api/integrations/status');
        state.integrations = fallback.integrations || [];
      } catch {}
    } finally {
      state.loading = false;
      render();
      measure('contextRefreshFinished', measurementSequence, measurementOutcome);
    }
    return state;
  }

  async function executeTool(name, args={}, options={}) {
    const headers = {'content-type':'application/json','idempotency-key':options.idempotencyKey || crypto.randomUUID()};
    if (options.explicitApproval) headers['x-oz-explicit-approval'] = 'true';
    if (options.sourceType) headers['x-oz-tool-source'] = options.sourceType;
    let payload;
    measure('toolNetworkStarted', options.measurementSequence);
    try {
      payload = await requestJson('/api/oz/tools', {
        method:'POST',
        headers,
        body:JSON.stringify({ name, arguments:args })
      });
      measure('toolNetworkFinished', options.measurementSequence, 'success');
    } catch (error) {
      measure('toolNetworkFinished', options.measurementSequence, 'failed');
      throw error;
    }
    if (!name.startsWith('oz_get_') && !name.startsWith('oz_list_')) {
      await refresh({measurementSequence:options.measurementSequence});
    }
    return payload.result;
  }

  els.summary?.addEventListener('click', openDrawer);
  els.networkBtn?.addEventListener('click', openDrawer);
  els.refreshBtn?.addEventListener('click', () => void refresh());
  document.querySelectorAll('[data-close-network]').forEach((element) => element.addEventListener('click', closeDrawer));
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (els.reviewBatchDialog && !els.reviewBatchDialog.classList.contains('hidden')) { event.preventDefault?.(); closeBatchConfirmation(); return; }
    if (els.drawer?.classList.contains('open')) closeDrawer();
  });

  els.reviewSelectAllBtn?.addEventListener('click', selectAllPendingReviews);
  els.reviewClearSelectionBtn?.addEventListener('click', clearReviewSelection);
  [els.reviewBulkApproveBtn, els.reviewBulkRejectBtn, els.reviewBulkNeedsEditBtn].forEach((button) => {
    button?.addEventListener('click', () => openBatchConfirmation(button.dataset.batchDecision));
  });
  els.reviewBatchCancelBtn?.addEventListener('click', closeBatchConfirmation);
  els.reviewBatchConfirmBtn?.addEventListener('click', async () => {
    const plan = pendingBatchPlan;
    if (!plan || batchDialogBusy) return;
    batchDialogBusy = true;
    els.reviewBatchConfirmBtn.disabled = true;
    if (els.reviewBatchCancelBtn) els.reviewBatchCancelBtn.disabled = true;
    if (els.reviewBatchResult) { els.reviewBatchResult.textContent = '一件ずつ安全に処理しています。'; delete els.reviewBatchResult.dataset.tone; }
    updateBulkControls();
    try {
      const result = await executeReviewBatch(plan, {sourceType:'MANUAL'});
      renderBatchResult(result);
      pendingBatchPlan = null;
      if (els.reviewBatchCancelBtn) els.reviewBatchCancelBtn.textContent = '閉じる';
      if (result.successCount === 0) feedback(`一括操作は完了しませんでした。失敗${result.failureCount}件`, 'error');
      else feedback(`一括操作：成功${result.successCount}件、失敗${result.failureCount}件`, result.failureCount ? 'error' : 'success');
    } catch {
      if (els.reviewBatchResult) { els.reviewBatchResult.textContent = '一括操作を開始できませんでした。最新状態を確認してください。'; els.reviewBatchResult.dataset.tone = 'error'; }
    } finally {
      batchDialogBusy = false;
      if (els.reviewBatchCancelBtn) els.reviewBatchCancelBtn.disabled = false;
      updateBulkControls();
    }
  });

  els.quickTaskForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (els.quickTaskForm.dataset.submitting === 'true') return;
    const title = String(els.quickTaskInput?.value || '').trim();
    if (!title) return;
    const button = els.quickTaskForm.querySelector('button');
    els.quickTaskForm.dataset.submitting = 'true';
    els.quickTaskForm.setAttribute('aria-busy', 'true');
    if (button) button.disabled = true;
    feedback('確認待ち候補を作成しています。');
    try {
      await executeTool('oz_create_task_candidate', { title, importance:3, executionEnvironment:'ANY', timeLane:'SOMEDAY' }, {sourceType:'QUICK_ADD'});
      els.quickTaskInput.value = '';
      feedback('確認待ち候補を作成しました。正式タスクにはまだ登録していません。', 'success');
    } catch (error) {
      console.error(error);
      feedback('候補を作成できませんでした。入力内容を確認して再度お試しください。', 'error');
      els.quickTaskInput?.setCustomValidity(String(error.message || error));
      els.quickTaskInput?.reportValidity();
      setTimeout(() => els.quickTaskInput?.setCustomValidity(''), 2500);
    } finally {
      delete els.quickTaskForm.dataset.submitting;
      els.quickTaskForm.removeAttribute('aria-busy');
      if (button) button.disabled = false;
    }
  });

  window.OZ_NETWORK = {
    initialized: true,
    refresh,
    executeTool,
    executeReviewResolution,
    requestJson,
    renderReviews,
    selectAllPendingReviews,
    clearReviewSelection,
    toggleReviewSelection,
    prepareReviewBatch,
    executeReviewBatch,
    openBatchConfirmation,
    closeBatchConfirmation,
    getState: () => ({ ...state, selectedReviewIds:[...selectedReviewIds], pendingBatchPlan }),
    open: openDrawer
  };
  setTimeout(() => void refresh(), 450);
})();
