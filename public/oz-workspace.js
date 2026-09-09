(() => {
  'use strict';

  if (window.OZ_WORKSPACE?.initialized) return;
  const $ = (id) => document.getElementById(id);
  const elements = {
    projectList: $('projectList'), projectCount: $('projectCount'), formalTaskList: $('formalTaskList'),
    projectFilter: $('taskProjectFilter'), statusFilter: $('taskStatusFilter'), importanceFilter: $('taskImportanceFilter'),
    dailyBrief: $('dailyBrief'), chatLog: $('chatLog'), chatStatus: $('chatStatus'), threadTitle: $('threadTitle'),
    textForm: $('ozTextForm'), textInput: $('ozTextInput'), taskDrawer: $('taskDrawer'), taskDrawerBody: $('taskDrawerBody'),
    taskDrawerTitle: $('taskDrawerTitle'), taskDrawerEyebrow: $('taskDrawerEyebrow'), taskCandidateForm: $('taskCandidateForm'),
    taskCandidateFeedback: $('taskCandidateFeedback'), newTaskCandidateBtn: $('newTaskCandidateBtn'),
    candidateDrawer: $('candidateDrawer'), initialCandidateBtn: $('initialCandidateBtn'), initialCandidateForm: $('initialCandidateForm'),
    initialCandidateList: $('initialCandidateList'), initialCandidateFeedback: $('initialCandidateFeedback'), legacyCandidateList: $('legacyCandidateList'),
    initialTaskSelectAllBtn: $('initialTaskSelectAllBtn'), initialTaskClearSelectionBtn: $('initialTaskClearSelectionBtn'),
    initialTaskSelectionCount: $('initialTaskSelectionCount'), initialTaskSubmitBtn: $('initialTaskSubmitBtn'),
    initialTaskConfirmDialog: $('initialTaskConfirmDialog'), initialTaskConfirmCount: $('initialTaskConfirmCount'),
    initialTaskConfirmList: $('initialTaskConfirmList'), initialTaskConfirmFeedback: $('initialTaskConfirmFeedback'),
    initialTaskConfirmCancelBtn: $('initialTaskConfirmCancelBtn'), initialTaskConfirmSubmitBtn: $('initialTaskConfirmSubmitBtn'),
    browserNotificationBtn: $('browserNotificationBtn'), tasksModeBtn: $('tasksModeBtn'), demoModeBtn: $('demoModeBtn'),
    liveModeBtn: $('liveModeBtn'), contextPill: $('contextPill'), autoPill: $('autoPill'), stageCode: $('stageCode'),
    clock: $('clock'), fullscreenBtn: $('fullscreenBtn'),
  };
  const state = {
    mode: 'tasks', rightView: 'oz', taskView: 'TODAY', selectedProjectId: '', selectedTaskId: null,
    context: {projects:[], tasks:[], reviews:[], auditLogs:[], integrations:[], externalActions:[], actionApprovals:[]},
    initialCandidates: [], initialTaskCandidates: [], legacyCandidates: {items:[]}, dailyBrief: null, submitting: false,
    pendingInitialTaskBatch: null,
    statusSubmissions: new Set(), statusNotice: null, demoAuthorized: false,
  };
  const TASK_STATUSES = ['UNSTARTED','IN_PROGRESS','WAITING','ON_HOLD','COMPLETED'];
  const TASK_TRANSITIONS = {
    UNSTARTED:['IN_PROGRESS','WAITING','ON_HOLD','COMPLETED'],
    IN_PROGRESS:['WAITING','ON_HOLD','COMPLETED'],
    WAITING:['IN_PROGRESS','ON_HOLD','COMPLETED'],
    ON_HOLD:['UNSTARTED','IN_PROGRESS','WAITING','COMPLETED'],
    COMPLETED:['IN_PROGRESS'],
  };
  const escapeHtml = (value='') => String(value).replace(/[&<>'"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[char]));
  const displayLabels = {
    ACTIVE:'稼働中', ARCHIVED:'アーカイブ', PLANNED:'計画中', UNSTARTED:'未着手', IN_PROGRESS:'進行中',
    WAITING:'返事待ち', ON_HOLD:'保留', COMPLETED:'完了', PENDING:'確認待ち', NEEDS_EDIT:'要修正',
    APPROVED:'承認済み', REJECTED:'却下', PROPOSED:'承認待ち', ANY:'指定なし', MOBILE:'モバイル',
    PC:'PC', TRAVEL_OK:'移動中可', CALL:'電話', IN_PERSON:'対面', SELF:'自分', CANDIDATE:'委任候補',
    DELEGATED:'委任済み', DUE:'期限指定', TODAY_IF_POSSIBLE:'できれば今日', SOMEDAY:'いつか',
    TASK_CREATE:'タスク作成', TASK_UPDATE:'タスク編集', TASK_STATUS_CHANGE:'ステータス変更',
    PROJECT_CREATE:'プロジェクト作成', QUICK_ADD:'クイック追加', VOICE:'音声', MANUAL:'手動',
    REVIEW_CREATED:'確認待ち作成', REVIEW_RESOLVED:'確認待ち解決', SUCCESS:'成功', FAILURE:'失敗',
  };
  const label = (value='') => displayLabels[String(value).toUpperCase()] || String(value).replaceAll('_', ' ');
  const jstDay = (value=new Date()) => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Tokyo', year:'numeric', month:'2-digit', day:'2-digit'}).format(new Date(value));
  const shortDate = (value) => value ? new Intl.DateTimeFormat('ja-JP', {timeZone:'Asia/Tokyo', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'}).format(new Date(value)) : '未設定';
  const briefDate = (value) => value ? `${new Intl.DateTimeFormat('ja-JP', {timeZone:'Asia/Tokyo', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false}).format(new Date(value)).replaceAll('/', '-')} JST` : '期限未設定';

  function projectIdentity(value='') {
    const normalized = String(value).normalize('NFKC').toLowerCase()
      .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 96);
    return normalized || 'project-candidate';
  }

  function candidateFromReview(review={}) {
    const candidate = review.candidate_data || review.candidateData;
    return candidate && typeof candidate === 'object' && !Array.isArray(candidate) ? candidate : {};
  }

  function initialCandidateAvailability(candidate={}) {
    const identity = projectIdentity(candidate.name);
    const formal = (state.context.projects || []).some((project) => projectIdentity(project.slug || project.name) === identity);
    if (formal) return {disabled:true, reason:'正式プロジェクトとして登録済み'};
    const review = (state.context.reviews || []).find((item) => item.kind === 'PROJECT_CREATE'
      && ['PENDING','NEEDS_EDIT'].includes(item.status)
      && projectIdentity(candidateFromReview(item).slug || candidateFromReview(item).name) === identity);
    if (review) return {disabled:true, reason:review.status === 'NEEDS_EDIT' ? '要修正の候補があります' : '確認待ちへ追加済み'};
    return {disabled:false, reason:'承認前の候補'};
  }

  function formalProjectForInitialCandidate(candidate={}) {
    const identity = projectIdentity(candidate.name);
    return (state.context.projects || []).find((project) => projectIdentity(project.slug || project.name) === identity) || null;
  }

  function initialTaskForProject(candidate={}) {
    return state.initialTaskCandidates.find((task) => task.projectKey === candidate.key) || null;
  }

  function initialTaskAvailability(projectCandidate={}, taskCandidate={}) {
    const formalProject = formalProjectForInitialCandidate(projectCandidate);
    if (!formalProject) return {disabled:true, reason:'プロジェクト承認後にタスク候補を作成できます', formalProject:null};
    const identity = projectIdentity(taskCandidate.title);
    const formalTask = (state.context.tasks || []).some((task) => task.projectId === formalProject.id && projectIdentity(task.title) === identity);
    if (formalTask) return {disabled:true, reason:'正式タスクとして登録済み', formalProject};
    const review = (state.context.reviews || []).find((item) => {
      if (item.kind !== 'TASK_CREATE' || !['PENDING','NEEDS_EDIT'].includes(item.status)) return false;
      const pending = candidateFromReview(item);
      return pending.projectId === formalProject.id && projectIdentity(pending.title) === identity;
    });
    if (review) return {disabled:true, reason:review.status === 'NEEDS_EDIT' ? '要修正のタスク候補があります' : 'タスク候補を確認待ちへ追加済み', formalProject};
    return {disabled:false, reason:'この正式プロジェクトへタスク候補を追加できます', formalProject};
  }

  function initialTaskEntries() {
    return state.initialTaskCandidates.map((task) => {
      const projectCandidate = state.initialCandidates.find((candidate) => candidate.key === task.projectKey) || null;
      const availability = projectCandidate
        ? initialTaskAvailability(projectCandidate, task)
        : {disabled:true, reason:'紐付くプロジェクト候補が見つかりません', formalProject:null};
      return {task, projectCandidate, availability};
    });
  }

  function selectedInitialTaskEntries() {
    const selectedKeys = new Set([...(elements.initialCandidateForm?.querySelectorAll('input[name="task-candidate"]:checked') || [])].map((input) => input.value));
    return initialTaskEntries().filter((entry) => selectedKeys.has(entry.task.key)
      && !entry.availability.disabled && Boolean(entry.availability.formalProject?.id));
  }

  function syncInitialTaskBulkControls() {
    const entries = initialTaskEntries();
    const entryByKey = new Map(entries.map((entry) => [entry.task.key, entry]));
    const inputs = [...(elements.initialCandidateForm?.querySelectorAll('input[name="task-candidate"]') || [])];
    inputs.forEach((input) => {
      const entry = entryByKey.get(input.value);
      const unavailable = !entry || entry.availability.disabled;
      input.disabled = unavailable || state.submitting;
      if (unavailable) input.checked = false;
    });
    const availableCount = entries.filter((entry) => !entry.availability.disabled).length;
    const selectedCount = inputs.filter((input) => input.checked && entryByKey.has(input.value) && !entryByKey.get(input.value).availability.disabled).length;
    if (elements.initialTaskSelectionCount) elements.initialTaskSelectionCount.textContent = `選択中 ${selectedCount}/${entries.length}件`;
    if (elements.initialTaskSelectAllBtn) elements.initialTaskSelectAllBtn.disabled = state.submitting || availableCount === 0 || selectedCount === availableCount;
    if (elements.initialTaskClearSelectionBtn) elements.initialTaskClearSelectionBtn.disabled = state.submitting || selectedCount === 0;
    if (elements.initialTaskSubmitBtn) elements.initialTaskSubmitBtn.disabled = state.submitting || selectedCount === 0;
    return {total:entries.length, available:availableCount, selected:selectedCount};
  }

  function selectAllAvailableInitialTasks() {
    if (state.submitting) return syncInitialTaskBulkControls();
    const availableKeys = new Set(initialTaskEntries().filter((entry) => !entry.availability.disabled).map((entry) => entry.task.key));
    [...(elements.initialCandidateForm?.querySelectorAll('input[name="task-candidate"]') || [])].forEach((input) => {
      input.checked = availableKeys.has(input.value);
    });
    return syncInitialTaskBulkControls();
  }

  function clearInitialTaskSelection() {
    if (!state.submitting) [...(elements.initialCandidateForm?.querySelectorAll('input[name="task-candidate"]') || [])].forEach((input) => { input.checked = false; });
    return syncInitialTaskBulkControls();
  }

  function closeInitialTaskConfirmation() {
    if (state.submitting) return false;
    state.pendingInitialTaskBatch = null;
    elements.initialTaskConfirmDialog?.classList.add('hidden');
    elements.initialTaskConfirmDialog?.setAttribute('aria-hidden','true');
    if (elements.initialTaskConfirmFeedback) { elements.initialTaskConfirmFeedback.textContent = ''; delete elements.initialTaskConfirmFeedback.dataset.tone; }
    return true;
  }

  function openInitialTaskConfirmation() {
    if (state.submitting) return null;
    const entries = selectedInitialTaskEntries();
    if (!entries.length) {
      setFeedback(elements.initialCandidateFeedback, '登録可能なタスク候補を1件以上選択してください。', 'error');
      return null;
    }
    state.pendingInitialTaskBatch = entries.map((entry) => ({
      taskKey:entry.task.key,
      projectKey:entry.projectCandidate.key,
      projectId:entry.availability.formalProject.id,
      taskName:entry.task.title,
      projectName:entry.availability.formalProject.name || entry.task.projectName,
    }));
    if (elements.initialTaskConfirmCount) elements.initialTaskConfirmCount.textContent = `${entries.length}件`;
    if (elements.initialTaskConfirmList) elements.initialTaskConfirmList.innerHTML = state.pendingInitialTaskBatch.map((item) => `<li><strong>${escapeHtml(item.taskName)}</strong><span>${escapeHtml(item.projectName)}</span></li>`).join('');
    if (elements.initialTaskConfirmFeedback) { elements.initialTaskConfirmFeedback.textContent = ''; delete elements.initialTaskConfirmFeedback.dataset.tone; }
    elements.initialTaskConfirmDialog?.classList.remove('hidden');
    elements.initialTaskConfirmDialog?.setAttribute('aria-hidden','false');
    setFeedback(elements.initialCandidateFeedback);
    return state.pendingInitialTaskBatch;
  }

  function setFeedback(element, message='', tone='') {
    if (!element) return;
    element.textContent = message;
    element.dataset.tone = tone;
  }

  function updateClock() {
    if (elements.clock) elements.clock.textContent = new Date().toLocaleTimeString('ja-JP', {hour12:false});
    setTimeout(updateClock, 1000);
  }

  function fullscreenSupported() {
    return typeof document.documentElement?.requestFullscreen === 'function' && typeof document.exitFullscreen === 'function';
  }

  function syncFullscreenControl() {
    if (!elements.fullscreenBtn) return;
    const supported = fullscreenSupported();
    elements.fullscreenBtn.hidden = !supported;
    elements.fullscreenBtn.setAttribute('aria-pressed', String(Boolean(document.fullscreenElement)));
    elements.fullscreenBtn.title = document.fullscreenElement ? '全画面表示を終了' : '全画面表示';
  }

  async function toggleFullscreen() {
    if (!fullscreenSupported()) return false;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
      syncFullscreenControl();
      return true;
    } catch { return false; }
  }

  function setDemoControlsVisible(visible) {
    document.querySelectorAll('[data-demo-only]').forEach((element) => { element.hidden = !visible; });
  }

  function formalStatus(value) { return String(value || 'UNSTARTED').toUpperCase(); }
  function openTasks() { return state.context.tasks.filter((task) => formalStatus(task.formalStatus) !== 'COMPLETED'); }
  function allowedTaskStatuses(value) { return TASK_TRANSITIONS[formalStatus(value)] || []; }
  function pendingStatusReview(taskId, nextStatus='') {
    return (state.context.reviews || []).find((review) => {
      const candidate = review.candidate_data || {};
      const reviewTaskId = review.target_id || candidate.taskId;
      return review.kind === 'TASK_STATUS_CHANGE'
        && ['PENDING','NEEDS_EDIT'].includes(review.status)
        && reviewTaskId === taskId
        && (!nextStatus || candidate.status === nextStatus);
    }) || null;
  }

  async function proposeTaskStatusChange(taskId, nextStatus) {
    const task = (state.context.tasks || []).find((item) => item.id === taskId);
    const currentStatus = formalStatus(task?.formalStatus);
    if (!task || nextStatus === currentStatus) return false;
    if (!allowedTaskStatuses(currentStatus).includes(nextStatus)) {
      state.statusNotice = {taskId, tone:'error', message:'このステータスへの変更は許可されていません。'};
      renderTasks();
      return false;
    }
    if (state.statusSubmissions.has(taskId)) return false;
    if (pendingStatusReview(taskId)) {
      state.statusNotice = {taskId, tone:'pending', message:'このタスクのステータス変更はすでに確認待ちです。'};
      renderTasks();
      return false;
    }
    state.statusSubmissions.add(taskId);
    state.statusNotice = {taskId, tone:'pending', message:'ステータス変更候補を作成しています。'};
    renderTasks();
    try {
      await window.OZ_NETWORK.executeTool('oz_propose_task_status_change', {taskId, status:nextStatus}, {sourceType:'MANUAL'});
      state.statusNotice = {taskId, tone:'success', message:'ステータス変更を確認待ちへ追加しました'};
      return true;
    } catch {
      state.statusNotice = {taskId, tone:'error', message:'ステータス変更候補を作成できませんでした。'};
      return false;
    } finally {
      state.statusSubmissions.delete(taskId);
      renderTasks();
    }
  }

  function renderProjects() {
    const projects = state.context.projects || [];
    if (elements.projectCount) elements.projectCount.textContent = `${String(projects.length).padStart(2,'0')} 正式`;
    if (!elements.projectList) return;
    if (!projects.length) {
      elements.projectList.innerHTML = '<div class="network-empty">正式プロジェクトはまだありません。「初期候補」から確認待ちを作成できます。</div>';
    } else {
      elements.projectList.innerHTML = projects.map((project) => {
        const taskCount = state.context.tasks.filter((task) => task.projectId === project.id && formalStatus(task.formalStatus) !== 'COMPLETED').length;
        return `<article class="formal-project-card ${state.selectedProjectId === project.id ? 'active' : ''}" data-formal-project="${escapeHtml(project.id)}" tabindex="0">
          <header><strong>${escapeHtml(project.name)}</strong><b>${escapeHtml(label(project.formalStatus || 'ACTIVE'))}</b></header>
          <p>${escapeHtml(project.purpose || '説明は未設定です。')}</p>
          <footer><span>${taskCount} 未完了</span><span>重要度 ${Number(project.importance || 3)}</span><span>目標日 ${escapeHtml(project.targetDate || '未設定')}</span></footer>
        </article>`;
      }).join('');
      elements.projectList.querySelectorAll('[data-formal-project]').forEach((card) => {
        const select = () => {
          state.selectedProjectId = state.selectedProjectId === card.dataset.formalProject ? '' : card.dataset.formalProject;
          if (elements.projectFilter) elements.projectFilter.value = state.selectedProjectId;
          renderProjects(); renderTasks();
        };
        card.addEventListener('click', select);
        card.addEventListener('keydown', (event) => { if (event.key === 'Enter') select(); });
      });
    }
    const option = '<option value="">全プロジェクト</option>' + projects.map((project) => `<option value="${escapeHtml(project.id)}">${escapeHtml(project.name)}</option>`).join('');
    if (elements.projectFilter) { const current = state.selectedProjectId; elements.projectFilter.innerHTML = option; elements.projectFilter.value = current; }
    const candidateSelect = elements.taskCandidateForm?.querySelector('select[name="projectId"]');
    if (candidateSelect) candidateSelect.innerHTML = '<option value="">プロジェクトなし</option>' + projects.map((project) => `<option value="${escapeHtml(project.id)}">${escapeHtml(project.name)}</option>`).join('');
  }

  function filterTasks() {
    const nowDay = jstDay();
    const weekEnd = jstDay(new Date(Date.now() + 7 * 86400000));
    const status = elements.statusFilter?.value || '';
    const importance = Number(elements.importanceFilter?.value || 0);
    return (state.context.tasks || []).filter((task) => {
      const taskStatus = formalStatus(task.formalStatus);
      const due = task.dueAt ? jstDay(task.dueAt) : '';
      if (state.selectedProjectId && task.projectId !== state.selectedProjectId) return false;
      if (status && taskStatus !== status) return false;
      if (importance && Number(task.importance || 0) < importance) return false;
      if (state.taskView === 'TODAY') return taskStatus === 'IN_PROGRESS'
        || (taskStatus === 'UNSTARTED' && (due === nowDay || task.timeLane === 'TODAY_IF_POSSIBLE'));
      if (state.taskView === 'OVERDUE') return taskStatus !== 'COMPLETED' && Boolean(due) && due < nowDay;
      if (state.taskView === 'WEEK') return taskStatus !== 'COMPLETED' && Boolean(due) && due >= nowDay && due <= weekEnd;
      if (state.taskView === 'COMPLETED') return taskStatus === 'COMPLETED';
      return true;
    }).sort((left, right) => {
      if (state.taskView === 'TODAY') {
        const leftDue = left.dueAt ? new Date(left.dueAt).getTime() : Number.POSITIVE_INFINITY;
        const rightDue = right.dueAt ? new Date(right.dueAt).getTime() : Number.POSITIVE_INFINITY;
        return leftDue - rightDue || Number(right.importance || 0) - Number(left.importance || 0);
      }
      return Number(right.importance || 0) - Number(left.importance || 0) || String(left.dueAt || '9999').localeCompare(String(right.dueAt || '9999'));
    });
  }

  function renderTasks() {
    if (!elements.formalTaskList) return;
    const tasks = filterTasks();
    if (!tasks.length) {
      elements.formalTaskList.innerHTML = '<div class="network-empty">この表示条件に該当する正式タスクはありません。</div>';
      return;
    }
    const nowDay = jstDay();
    elements.formalTaskList.innerHTML = tasks.map((task) => {
      const status = formalStatus(task.formalStatus);
      const overdue = task.dueAt && jstDay(task.dueAt) < nowDay && status !== 'COMPLETED';
      const dueSoon = task.dueAt && jstDay(task.dueAt) >= nowDay && jstDay(task.dueAt) <= jstDay(new Date(Date.now() + 2 * 86400000)) && status !== 'COMPLETED';
      const assignment = task.delegationState === 'DELEGATED' ? task.delegateLabel : task.assigneeLabel;
      const statusReview = pendingStatusReview(task.id);
      const submitting = state.statusSubmissions.has(task.id);
      const statusLocked = submitting || Boolean(statusReview);
      const notice = state.statusNotice?.taskId === task.id ? state.statusNotice : statusReview
        ? {tone:'pending', message:`${label(statusReview.candidate_data?.status || 'PENDING')}への変更は確認待ちです。`}
        : null;
      const statusOptions = TASK_STATUSES.map((value) => {
        const current = value === status;
        const allowed = current || allowedTaskStatuses(status).includes(value);
        const suffix = current ? '（現在）' : !allowed ? '（選択不可）' : '';
        return `<option value="${value}" ${current ? 'selected' : ''} ${!allowed ? 'disabled' : ''}>${escapeHtml(label(value))}${suffix}</option>`;
      }).join('');
      return `<article class="formal-task-card ${status === 'COMPLETED' ? 'completed' : ''}" data-formal-task="${escapeHtml(task.id)}" data-importance="${Number(task.importance || 3)}" tabindex="0">
        <i class="task-priority-bar"></i><span class="formal-task-copy"><strong>${escapeHtml(task.title)}</strong><small>${escapeHtml(task.projectName || 'プロジェクトなし')} / ${escapeHtml(label(status))} / ${escapeHtml(label(task.executionEnvironment || 'ANY'))}</small><small>${task.estimatedMinutes == null ? '見積なし' : `${Number(task.estimatedMinutes)}分`} / ${escapeHtml(assignment || '自分')} / 依存 ${Array.isArray(task.dependencyIds) ? task.dependencyIds.length : 0} / ${escapeHtml(Array.isArray(task.sources) && task.sources.length ? task.sources.map(label).join('+') : 'ソースなし')} / 更新 ${escapeHtml(shortDate(task.updatedAt))}</small></span>
        <span class="formal-task-controls">
          <label class="task-status-control"><span>ステータス</span><select data-task-status="${escapeHtml(task.id)}" data-current-status="${status}" aria-label="${escapeHtml(task.title)}のステータスを変更" ${statusLocked ? 'disabled' : ''}>${statusOptions}</select></label>
          <span class="formal-task-meta"><span>重要度 ${Number(task.importance || 3)}</span><span class="${overdue ? 'overdue' : dueSoon ? 'due-soon' : ''}">${overdue ? '期限超過 ' : dueSoon ? '期限 ' : ''}${escapeHtml(shortDate(task.dueAt))}</span></span>
          ${notice ? `<span class="task-status-feedback" data-tone="${notice.tone}" role="status">${escapeHtml(notice.message)} <button type="button" data-open-status-review>確認する</button></span>` : ''}
        </span>
      </article>`;
    }).join('');
    elements.formalTaskList.querySelectorAll('[data-task-status]').forEach((select) => {
      select.addEventListener('click', (event) => event.stopPropagation());
      select.addEventListener('keydown', (event) => event.stopPropagation());
      select.addEventListener('change', () => {
        const nextStatus = select.value;
        const currentStatus = select.dataset.currentStatus;
        if (nextStatus === currentStatus) return;
        void proposeTaskStatusChange(select.dataset.taskStatus, nextStatus);
      });
    });
    elements.formalTaskList.querySelectorAll('[data-open-status-review]').forEach((button) => {
      button.addEventListener('click', (event) => { event.stopPropagation(); setRightView('reviews'); });
    });
    elements.formalTaskList.querySelectorAll('[data-formal-task]').forEach((card) => {
      const open = () => openTask(card.dataset.formalTask);
      card.addEventListener('click', (event) => { if (!event.target.closest('button,select,label')) open(); });
      card.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.target.closest('button,select,label')) open(); });
    });
  }

  function reviewLabel(review) {
    const candidate = candidateFromReview(review);
    return candidate.title || candidate.name || (review.kind === 'TASK_STATUS_CHANGE' && candidate.status ? `ステータスを${label(candidate.status)}へ変更` : label(review.kind || 'REVIEW'));
  }

  function reviewMeta(review) {
    const candidate = candidateFromReview(review);
    const values = [];
    if (candidate.status) values.push(label(candidate.status));
    if (candidate.importance != null) values.push(`重要度 ${Number(candidate.importance)}`);
    if (candidate.targetDate) values.push(`目標日 ${candidate.targetDate}`);
    return values.join(' / ');
  }

  async function resolveReview(reviewId, decision, container) {
    if (!reviewId || state.submitting) return;
    state.submitting = true;
    container?.querySelectorAll('button').forEach((button) => { button.disabled = true; });
    try {
      await window.OZ_NETWORK.executeReviewResolution(reviewId, decision, {sourceType:'MANUAL'});
      await refreshDailyBrief();
    } finally {
      state.submitting = false;
      container?.querySelectorAll('button').forEach((button) => { button.disabled = false; });
    }
  }

  function bindReviewScrollKeyboard(container) {
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

  function renderRightPanel() {
    if (!elements.chatLog || state.mode === 'demo') return;
    elements.chatLog.classList.toggle('reviews-view', state.rightView === 'reviews');
    document.querySelectorAll('[data-right-view]').forEach((button) => {
      const selected = button.dataset.rightView === state.rightView;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-selected', String(selected));
    });
    if (state.mode === 'live' && state.rightView === 'oz') { window.OZ_LIVE?.renderChat?.(); return; }
    if (state.rightView === 'oz') {
      const brief = state.dailyBrief;
      elements.chatLog.innerHTML = `<div class="side-feed"><article class="side-feed-card"><small>私 / 今日の整理</small><strong>${escapeHtml(brief?.summary || '「OZ、おはよう」で今日の優先順位を整理します。')}</strong></article><article class="side-feed-card"><small>正式データ</small><strong>${openTasks().length} 未完了タスク / ${(state.context.reviews || []).filter((item) => ['PENDING','NEEDS_EDIT'].includes(item.status)).length} 確認待ち</strong></article></div>`;
      return;
    }
    if (state.rightView === 'reviews') {
      const reviews = (state.context.reviews || []).filter((item) => ['PENDING','NEEDS_EDIT'].includes(item.status));
      const projectPending = reviews.filter((item) => item.kind === 'PROJECT_CREATE' && item.status === 'PENDING');
      const selectedIds = new Set(window.OZ_NETWORK?.getState?.().selectedReviewIds || []);
      const visibleSelected = projectPending.filter((review) => selectedIds.has(review.id)).length;
      const selectAllDisabled = projectPending.length === 0 || visibleSelected === projectPending.length;
      const toolbar = `<div class="review-bulk-toolbar side-review-bulk" aria-label="プロジェクト候補の一括操作">
        <div class="review-bulk-selection"><button type="button" data-side-select-all ${selectAllDisabled ? 'disabled' : ''}>${projectPending.length}件すべて選択</button><button type="button" data-side-clear-selection ${visibleSelected ? '' : 'disabled'}>選択解除</button><span>${visibleSelected}件選択中</span></div>
        <div class="review-bulk-actions"><button type="button" data-side-batch-decision="APPROVED" ${visibleSelected ? '' : 'disabled'}>一括承認</button><button type="button" data-side-batch-decision="NEEDS_EDIT" ${visibleSelected ? '' : 'disabled'}>一括要修正</button><button type="button" data-side-batch-decision="REJECTED" ${visibleSelected ? '' : 'disabled'}>一括却下</button></div>
      </div>`;
      const list = reviews.length ? `<div class="side-feed">${reviews.map((review) => {
        const candidate = candidateFromReview(review);
        const selectable = review.kind === 'PROJECT_CREATE' && review.status === 'PENDING';
        const selection = selectable ? `<label class="side-review-select"><input type="checkbox" data-side-review-select="${escapeHtml(review.id)}" aria-label="${escapeHtml(reviewLabel(review))}を選択" ${selectedIds.has(review.id) ? 'checked' : ''}><span>選択</span></label>` : '';
        return `<article class="side-feed-card" data-side-review="${escapeHtml(review.id)}">${selection}<small>${escapeHtml(label(review.kind))} / ${escapeHtml(label(review.status))}</small><strong>${escapeHtml(reviewLabel(review))}</strong>${reviewMeta(review) ? `<small>${escapeHtml(reviewMeta(review))}</small>` : ''}${candidate.description ? `<small>${escapeHtml(candidate.description)}</small>` : ''}<div class="review-actions"><button class="approve" data-side-decision="APPROVED">承認する</button><button data-side-decision="NEEDS_EDIT">要修正</button><button data-side-decision="REJECTED">却下する</button></div></article>`;
      }).join('')}</div>` : '<div class="chat-empty"><span class="empty-pulse"></span>確認待ちはありません。</div>';
      elements.chatLog.innerHTML = `<div class="side-review-layout">${toolbar}<div class="side-review-scroll" tabindex="0" role="region" aria-label="確認待ち候補一覧">${list}</div></div>`;
      bindReviewScrollKeyboard(elements.chatLog.querySelector('.side-review-scroll'));
      elements.chatLog.querySelectorAll('[data-side-review-select]').forEach((checkbox) => checkbox.addEventListener('change', () => {
        window.OZ_NETWORK?.toggleReviewSelection?.(checkbox.dataset.sideReviewSelect, checkbox.checked);
      }));
      elements.chatLog.querySelector('[data-side-select-all]')?.addEventListener('click', () => { window.OZ_NETWORK?.selectAllPendingReviews?.(); });
      elements.chatLog.querySelector('[data-side-clear-selection]')?.addEventListener('click', () => { window.OZ_NETWORK?.clearReviewSelection?.(); });
      elements.chatLog.querySelectorAll('[data-side-batch-decision]').forEach((button) => button.addEventListener('click', () => {
        window.OZ_NETWORK?.openBatchConfirmation?.(button.dataset.sideBatchDecision);
      }));
      elements.chatLog.querySelectorAll('[data-side-decision]').forEach((button) => button.addEventListener('click', () => {
        const card = button.closest('[data-side-review]');
        void resolveReview(card?.dataset.sideReview, button.dataset.sideDecision, card).catch(() => renderRightPanel());
      }));
      return;
    }
    if (state.rightView === 'approvals') {
      const actions = state.context.externalActions || [];
      elements.chatLog.innerHTML = actions.length ? `<div class="side-feed">${actions.map((action) => `<article class="side-feed-card" data-side-action="${escapeHtml(action.id)}"><small>${escapeHtml(action.provider)} / ${escapeHtml(label(action.status))}</small><strong>${escapeHtml(label(action.action_type))}</strong><small>${action.status === 'PROPOSED' ? '外部実行は行われていません。承認してもPhase 1Bでは実行しません。' : '承認履歴を確認してください。'}</small>${action.status === 'PROPOSED' ? '<div class="review-actions"><button class="approve" data-action-decision="APPROVED">候補を承認</button><button data-action-decision="REJECTED">却下する</button></div>' : ''}</article>`).join('')}</div>` : '<div class="chat-empty"><span class="empty-pulse"></span>外部操作候補はありません。</div>';
      elements.chatLog.querySelectorAll('[data-action-decision]').forEach((button) => button.addEventListener('click', async () => {
        const card = button.closest('[data-side-action]'); if (!card || state.submitting) return;
        state.submitting = true; card.querySelectorAll('button').forEach((item) => { item.disabled = true; });
        try { await window.OZ_NETWORK.requestJson(`/api/oz/actions/${encodeURIComponent(card.dataset.sideAction)}/decision`, {method:'POST', headers:{'content-type':'application/json','idempotency-key':crypto.randomUUID(),'x-oz-explicit-approval':'true'}, body:JSON.stringify({decision:button.dataset.actionDecision})}); await window.OZ_NETWORK.refresh(); }
        finally { state.submitting = false; }
      }));
      return;
    }
    const logs = state.context.auditLogs || [];
    elements.chatLog.innerHTML = logs.length ? `<div class="side-feed">${logs.slice(0,40).map((item) => `<article class="side-feed-card"><small>${escapeHtml(shortDate(item.created_at))}</small><strong>${escapeHtml(label(item.action))}</strong><small>${escapeHtml(label(item.outcome))} / ${escapeHtml(label(item.target_type))}</small></article>`).join('')}</div>` : '<div class="chat-empty"><span class="empty-pulse"></span>監査イベントはありません。</div>';
  }

  function renderDailyBrief() {
    if (!elements.dailyBrief) return;
    if (!state.dailyBrief) { elements.dailyBrief.classList.add('hidden'); return; }
    const top = state.dailyBrief.topPriorities || [];
    const waitingAlerts = state.dailyBrief.waitingAlerts || [];
    const waitingUpcoming = state.dailyBrief.waitingUpcoming || [];
    const group = (title, tasks, tone='') => tasks.length ? `<section class="daily-brief-group ${tone}" data-brief-group="${escapeHtml(title)}"><b>${escapeHtml(title)}</b>${tasks.map((task) => `<button type="button" data-brief-task="${escapeHtml(task.id)}" title="${escapeHtml(task.title)}"><span>${escapeHtml(task.project || task.title)}</span><small>${escapeHtml(label(task.status))} / ${escapeHtml(briefDate(task.dueAt))}</small></button>`).join('')}</section>` : '';
    elements.dailyBrief.classList.remove('hidden');
    elements.dailyBrief.innerHTML = `<strong>私 / 今日</strong><div><span class="daily-brief-summary">${escapeHtml(state.dailyBrief.summary)}</span><div class="daily-brief-groups">${group('最優先の作業対象', top.slice(0,1), 'primary')}${group('次の作業対象', top.slice(1))}${group('返事待ち・期限接近アラート', waitingAlerts, 'waiting-alert')}${group('今後の返事待ち', waitingUpcoming, 'waiting')}</div></div>`;
    elements.dailyBrief.querySelectorAll('[data-brief-task]').forEach((button) => button.addEventListener('click', () => openTask(button.dataset.briefTask)));
  }

  function render() { renderProjects(); renderTasks(); renderDailyBrief(); renderRightPanel(); }

  function updateContext(detail) {
    state.context = {...state.context, ...detail};
    if (state.statusNotice && Array.isArray(detail.reviews) && !pendingStatusReview(state.statusNotice.taskId)) state.statusNotice = null;
    if (elements.candidateDrawer?.classList.contains('open')) renderInitialCandidates();
    render();
  }

  function setRightView(view) {
    if (!['oz','reviews','approvals','activity'].includes(view)) return;
    state.rightView = view; document.body.dataset.ozRightView = view; renderRightPanel();
  }

  function taskDetails(task) {
    const localDue = task.dueAt ? new Date(new Date(task.dueAt).getTime() - new Date(task.dueAt).getTimezoneOffset() * 60000).toISOString().slice(0,16) : '';
    return `<div class="task-detail-grid">
      <div class="task-detail"><span>ステータス</span><strong>${escapeHtml(label(formalStatus(task.formalStatus)))}</strong></div><div class="task-detail"><span>プロジェクト</span><strong>${escapeHtml(task.projectName || 'プロジェクトなし')}</strong></div>
      <div class="task-detail"><span>重要度</span><strong>${Number(task.importance || 3)}</strong></div><div class="task-detail"><span>期限（JST）</span><strong>${escapeHtml(shortDate(task.dueAt))}</strong></div>
      <div class="task-detail"><span>見積時間</span><strong>${task.estimatedMinutes == null ? '未設定' : `${Number(task.estimatedMinutes)}分`}</strong></div><div class="task-detail"><span>実行環境</span><strong>${escapeHtml(label(task.executionEnvironment || 'ANY'))}</strong></div>
      <div class="task-detail"><span>担当者</span><strong>${escapeHtml(task.assigneeLabel || '自分')}</strong></div><div class="task-detail"><span>委任状態</span><strong>${escapeHtml(label(task.delegationState || 'SELF'))}</strong></div>
      <div class="task-detail"><span>実績時間</span><strong>${task.actualMinutes == null ? '未設定' : `${Number(task.actualMinutes)}分`}</strong></div><div class="task-detail"><span>依存タスク</span><strong>${Array.isArray(task.dependencyIds) ? task.dependencyIds.length : 0}</strong></div>
      <div class="task-detail"><span>情報源</span><strong>${escapeHtml(Array.isArray(task.sources) && task.sources.length ? task.sources.map(label).join(' / ') : 'なし')}</strong></div><div class="task-detail"><span>移動中</span><strong>${task.travelAllowed ? '対応可' : '対応不可'}</strong></div>
    </div>
    ${task.description ? `<div class="task-detail"><span>説明</span><strong>${escapeHtml(task.description)}</strong></div>` : ''}
    ${task.blockReason ? `<div class="task-detail"><span>停滞理由</span><strong>${escapeHtml(task.blockReason)}</strong></div>` : ''}
    <div class="task-status-actions">${allowedTaskStatuses(task.formalStatus).map((status) => `<button type="button" data-propose-status="${status}">${label(status)}</button>`).join('')}</div>
    <form class="task-edit-form"><label><span>タイトル</span><input name="title" maxlength="180" value="${escapeHtml(task.title)}" required></label><label><span>プロジェクト</span><select name="projectId"><option value="">プロジェクトなし</option>${state.context.projects.map((project) => `<option value="${escapeHtml(project.id)}" ${project.id === task.projectId ? 'selected' : ''}>${escapeHtml(project.name)}</option>`).join('')}</select></label><div class="form-grid"><label><span>重要度</span><select name="importance">${[1,2,3,4,5].map((value) => `<option value="${value}" ${Number(task.importance) === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label><label><span>見積時間（分）</span><input name="estimatedMinutes" type="number" min="0" value="${task.estimatedMinutes ?? ''}"></label><label><span>実績時間（分）</span><input name="actualMinutes" type="number" min="0" value="${task.actualMinutes ?? ''}"></label><label><span>期限（ローカル）</span><input name="dueAt" type="datetime-local" value="${localDue}"></label><label><span>時間区分</span><select name="timeLane">${['DUE','TODAY_IF_POSSIBLE','SOMEDAY'].map((value) => `<option value="${value}" ${value === task.timeLane ? 'selected' : ''}>${label(value)}</option>`).join('')}</select></label><label><span>実行環境</span><select name="executionEnvironment">${['ANY','MOBILE','PC','TRAVEL_OK','CALL','IN_PERSON'].map((value) => `<option value="${value}" ${value === task.executionEnvironment ? 'selected' : ''}>${label(value)}</option>`).join('')}</select></label><label><span>委任状態</span><select name="delegationState">${['SELF','CANDIDATE','DELEGATED'].map((value) => `<option value="${value}" ${value === task.delegationState ? 'selected' : ''}>${label(value)}</option>`).join('')}</select></label></div><div class="form-grid"><label><span>担当者</span><input name="assigneeLabel" maxlength="180" value="${escapeHtml(task.assigneeLabel || '')}"></label><label><span>委任先</span><input name="delegateLabel" maxlength="180" value="${escapeHtml(task.delegateLabel || '')}"></label></div><label><span>説明</span><textarea name="description" maxlength="10000">${escapeHtml(task.description || '')}</textarea></label><label><span>停滞理由</span><textarea name="blockReason" maxlength="2000">${escapeHtml(task.blockReason || '')}</textarea></label><label class="candidate-check"><input name="travelAllowed" type="checkbox" ${task.travelAllowed ? 'checked' : ''}><span>移動中の対応可</span></label><div class="review-feedback" data-task-edit-feedback></div><button class="candidate-submit" type="submit">編集候補を確認待ちへ送る</button></form>`;
  }

  function openTask(taskId) {
    const task = state.context.tasks.find((item) => item.id === taskId);
    if (!task || !elements.taskDrawer) return;
    state.selectedTaskId = taskId;
    elements.taskCandidateForm?.classList.add('hidden');
    if (elements.taskDrawerEyebrow) elements.taskDrawerEyebrow.textContent = '正式タスク / 変更は確認待ち経由';
    if (elements.taskDrawerTitle) elements.taskDrawerTitle.textContent = task.title;
    elements.taskDrawerBody.innerHTML = taskDetails(task);
    elements.taskDrawerBody.querySelectorAll('[data-propose-status]').forEach((button) => button.addEventListener('click', async () => {
      button.disabled = true;
      try { if (await proposeTaskStatusChange(taskId, button.dataset.proposeStatus)) closeTaskDrawer(); else button.disabled = false; }
      catch { button.disabled = false; }
    }));
    elements.taskDrawerBody.querySelector('.task-edit-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (state.submitting) return;
      const form = event.currentTarget;
      const data = new FormData(form);
      const dueValue = String(data.get('dueAt') || '');
      const patch = {title:String(data.get('title') || '').trim(), description:String(data.get('description') || '').trim() || null, projectId:String(data.get('projectId') || '') || null, importance:Number(data.get('importance') || 3), estimatedMinutes:data.get('estimatedMinutes') === '' ? null : Number(data.get('estimatedMinutes')), actualMinutes:data.get('actualMinutes') === '' ? null : Number(data.get('actualMinutes')), dueAt:dueValue ? new Date(dueValue).toISOString() : null, timeLane:String(data.get('timeLane') || 'SOMEDAY'), executionEnvironment:String(data.get('executionEnvironment') || 'ANY'), assigneeLabel:String(data.get('assigneeLabel') || '').trim() || null, delegationState:String(data.get('delegationState') || 'SELF'), delegateLabel:String(data.get('delegateLabel') || '').trim() || null, blockReason:String(data.get('blockReason') || '').trim() || null, travelAllowed:data.get('travelAllowed') === 'on'};
      state.submitting = true; form.querySelector('button').disabled = true; setFeedback(form.querySelector('[data-task-edit-feedback]'), '編集候補を作成しています。');
      try { await window.OZ_NETWORK.executeTool('oz_propose_task_update', {taskId, patch}, {sourceType:'MANUAL'}); setFeedback(form.querySelector('[data-task-edit-feedback]'), '確認待ちへ追加しました。正式タスクは未変更です。', 'success'); }
      catch { setFeedback(form.querySelector('[data-task-edit-feedback]'), '編集候補を作成できませんでした。', 'error'); form.querySelector('button').disabled = false; }
      finally { state.submitting = false; }
    });
    elements.taskDrawer.classList.add('open'); elements.taskDrawer.setAttribute('aria-hidden','false');
  }

  function openNewTask() {
    if (!elements.taskDrawer) return;
    elements.taskDrawerBody.innerHTML = '';
    elements.taskCandidateForm?.reset(); elements.taskCandidateForm?.classList.remove('hidden');
    const project = elements.taskCandidateForm?.querySelector('select[name="projectId"]'); if (project) project.value = state.selectedProjectId;
    if (elements.taskDrawerEyebrow) elements.taskDrawerEyebrow.textContent = '確認待ち専用';
    if (elements.taskDrawerTitle) elements.taskDrawerTitle.textContent = '新しいタスク候補';
    setFeedback(elements.taskCandidateFeedback);
    elements.taskDrawer.classList.add('open'); elements.taskDrawer.setAttribute('aria-hidden','false');
  }
  function closeTaskDrawer() { elements.taskDrawer?.classList.remove('open'); elements.taskDrawer?.setAttribute('aria-hidden','true'); state.selectedTaskId = null; }

  async function refreshDailyBrief() {
    try {
      const result = await window.OZ_NETWORK.executeTool('oz_get_daily_brief', {});
      state.dailyBrief = result?.data || null;
    } catch { state.dailyBrief = null; }
    render();
  }

  async function openCandidates() {
    elements.candidateDrawer?.classList.add('open'); elements.candidateDrawer?.setAttribute('aria-hidden','false');
    try {
      const [candidatePayload, legacyPayload] = await Promise.all([
        window.OZ_NETWORK.requestJson?.('/api/oz/projects/initial-candidates'),
        window.OZ_NETWORK.requestJson?.('/api/oz/legacy-candidates'),
      ]);
      state.initialCandidates = candidatePayload?.candidates || [];
      state.initialTaskCandidates = candidatePayload?.taskCandidates || [];
      state.legacyCandidates = legacyPayload || {items:[]};
    } catch { state.initialCandidates = []; state.initialTaskCandidates = []; state.legacyCandidates = {items:[]}; }
    renderInitialCandidates();
    if (elements.legacyCandidateList) elements.legacyCandidateList.innerHTML = (state.legacyCandidates.items || []).map((item) => `<div class="legacy-candidate-item"><span>${escapeHtml(item.label)}</span><b>${escapeHtml(item.type.toUpperCase())}</b></div>`).join('') || '<div class="network-empty">legacy候補はありません。</div>';
  }

  function renderInitialCandidates() {
    if (!elements.initialCandidateList) return;
    elements.initialCandidateList.innerHTML = state.initialCandidates.map((candidate, index) => {
      const availability = initialCandidateAvailability(candidate);
      const initialTask = initialTaskForProject(candidate);
      const taskAvailability = initialTask ? initialTaskAvailability(candidate, initialTask) : null;
      const targetDate = candidate.targetDate || '未設定';
      return `<article class="initial-candidate-item ${availability.disabled ? 'project-unavailable' : ''}">
        <label class="initial-project-choice"><input type="checkbox" name="project-candidate" value="${escapeHtml(candidate.key)}" ${availability.disabled ? 'disabled' : ''}><span><strong>${escapeHtml(candidate.name)}</strong><small>${escapeHtml(label(candidate.status))} / 重要度 ${Number(candidate.importance)} / 目標日 ${escapeHtml(targetDate)} / ${String(index + 1).padStart(2,'0')}</small></span></label>
        <div class="initial-candidate-copy"><p>${escapeHtml(candidate.purpose)}</p>${candidate.note ? `<small class="candidate-note">${escapeHtml(candidate.note)}</small>` : ''}<small class="candidate-availability">${escapeHtml(availability.reason)}</small>
        ${initialTask ? `<label class="initial-task-candidate ${taskAvailability.disabled ? 'unavailable' : ''}"><input type="checkbox" name="task-candidate" value="${escapeHtml(initialTask.key)}" ${(taskAvailability.disabled || state.submitting) ? 'disabled' : ''}><span><b>承認後の初期タスク</b><strong>${escapeHtml(initialTask.title)}</strong><small>${escapeHtml(label(initialTask.status))} / 重要度 ${Number(initialTask.importance)} / 期限 ${escapeHtml(initialTask.dueDate || '未設定')} / 担当者 未設定</small><small class="candidate-availability">${escapeHtml(taskAvailability.reason)}</small></span></label>` : ''}</div>
      </article>`;
    }).join('') || '<div class="network-empty">候補一覧を取得できませんでした。</div>';
    const submit = elements.initialCandidateForm?.querySelector('button[type="submit"]');
    const projectAvailable = state.initialCandidates.some((candidate) => !initialCandidateAvailability(candidate).disabled);
    if (submit) submit.disabled = state.submitting || !projectAvailable;
    elements.initialCandidateList.querySelectorAll('input[name="task-candidate"]').forEach((input) => input.addEventListener('change', syncInitialTaskBulkControls));
    syncInitialTaskBulkControls();
  }
  function closeCandidates() { elements.candidateDrawer?.classList.remove('open'); elements.candidateDrawer?.setAttribute('aria-hidden','true'); }

  async function confirmInitialTaskBatch() {
    const plan = state.pendingInitialTaskBatch;
    if (!Array.isArray(plan) || !plan.length || state.submitting) return null;
    state.submitting = true;
    if (elements.initialTaskConfirmSubmitBtn) elements.initialTaskConfirmSubmitBtn.disabled = true;
    if (elements.initialTaskConfirmCancelBtn) elements.initialTaskConfirmCancelBtn.disabled = true;
    if (elements.initialTaskConfirmFeedback) { elements.initialTaskConfirmFeedback.textContent = '一件ずつ確認待ちへ追加しています。'; delete elements.initialTaskConfirmFeedback.dataset.tone; }
    syncInitialTaskBulkControls();
    let completed = 0;
    let failed = 0;
    for (const item of plan) {
      const task = state.initialTaskCandidates.find((candidate) => candidate.key === item.taskKey);
      const projectCandidate = state.initialCandidates.find((candidate) => candidate.key === item.projectKey);
      const availability = task && projectCandidate ? initialTaskAvailability(projectCandidate, task) : {disabled:true, formalProject:null};
      if (!task || !projectCandidate || availability.disabled || availability.formalProject?.id !== item.projectId) { failed += 1; continue; }
      try {
        await window.OZ_NETWORK.executeTool('oz_create_task_candidate', {
          title:task.title,
          projectId:availability.formalProject.id,
          projectCandidate:task.projectName,
          description:null,
          importance:task.importance,
          dueAt:null,
          assigneeLabel:null,
          delegationState:'SELF',
          executionEnvironment:'ANY',
          timeLane:'SOMEDAY',
          sourceEvidence:[],
          missingFields:[],
          source:task.source,
        }, {sourceType:'MANUAL', idempotencyKey:`initial-task:${task.key}:${availability.formalProject.id}:20260825-v1`});
        completed += 1;
      } catch { failed += 1; }
    }
    state.submitting = false;
    state.pendingInitialTaskBatch = null;
    elements.initialTaskConfirmDialog?.classList.add('hidden');
    elements.initialTaskConfirmDialog?.setAttribute('aria-hidden','true');
    if (elements.initialTaskConfirmSubmitBtn) elements.initialTaskConfirmSubmitBtn.disabled = false;
    if (elements.initialTaskConfirmCancelBtn) elements.initialTaskConfirmCancelBtn.disabled = false;
    setFeedback(elements.initialCandidateFeedback, failed
      ? `タスク${completed}件を確認待ちへ追加し、${failed}件は追加できませんでした。正式タスクは未作成です。`
      : `タスク${completed}件を確認待ちへ追加しました。正式タスクは未作成です。`, failed ? 'error' : 'success');
    renderInitialCandidates();
    return {completed, failed};
  }

  function setMode(mode) {
    if (!['tasks','demo','live'].includes(mode)) return;
    if (mode === 'demo' && !state.demoAuthorized) return;
    state.mode = mode; document.body.dataset.ozMode = mode;
    [[elements.tasksModeBtn, 'tasks'], [elements.demoModeBtn, 'demo'], [elements.liveModeBtn, 'live']].forEach(([button, value]) => {
      const selected = mode === value;
      button?.classList.toggle('active', selected);
      button?.setAttribute('aria-pressed', String(selected));
    });
    if (mode === 'demo') { window.OZ_DEMO_APP?.start?.(); }
    else { window.OZ_DEMO_APP?.stop?.(); render(); }
    if (mode === 'tasks') {
      if (elements.autoPill) elements.autoPill.textContent = '正式';
      if (elements.stageCode) elements.stageCode.textContent = 'OZ / タスク';
      if (elements.contextPill) elements.contextPill.textContent = '正式タスク';
    }
    window.dispatchEvent(new CustomEvent('oz:mode-requested', {detail:{mode}}));
  }

  document.querySelectorAll('[data-task-view]').forEach((button) => button.addEventListener('click', () => {
    state.taskView = button.dataset.taskView;
    document.querySelectorAll('[data-task-view]').forEach((item) => {
      const selected = item === button;
      item.classList.toggle('active', selected);
      item.setAttribute('aria-selected', String(selected));
    });
    renderTasks();
  }));
  document.querySelectorAll('[data-right-view]').forEach((button) => button.addEventListener('click', () => setRightView(button.dataset.rightView)));
  elements.projectFilter?.addEventListener('change', () => { state.selectedProjectId = elements.projectFilter.value; renderProjects(); renderTasks(); });
  elements.statusFilter?.addEventListener('change', renderTasks); elements.importanceFilter?.addEventListener('change', renderTasks);
  elements.newTaskCandidateBtn?.addEventListener('click', openNewTask);
  document.querySelectorAll('[data-close-task-drawer]').forEach((item) => item.addEventListener('click', closeTaskDrawer));
  elements.initialCandidateBtn?.addEventListener('click', () => void openCandidates());
  document.querySelectorAll('[data-close-candidate-drawer]').forEach((item) => item.addEventListener('click', closeCandidates));
  elements.initialTaskSelectAllBtn?.addEventListener('click', selectAllAvailableInitialTasks);
  elements.initialTaskClearSelectionBtn?.addEventListener('click', clearInitialTaskSelection);
  elements.initialTaskSubmitBtn?.addEventListener('click', openInitialTaskConfirmation);
  elements.initialTaskConfirmCancelBtn?.addEventListener('click', closeInitialTaskConfirmation);
  elements.initialTaskConfirmSubmitBtn?.addEventListener('click', () => { void confirmInitialTaskBatch(); });
  elements.tasksModeBtn?.addEventListener('click', () => setMode('tasks'));
  elements.demoModeBtn?.addEventListener('click', () => setMode('demo'));
  elements.fullscreenBtn?.addEventListener('click', () => { void toggleFullscreen(); });
  document.addEventListener('fullscreenchange', syncFullscreenControl);

  async function authorizeLocalDemoRoute() {
    const host = window.location?.hostname || '';
    const path = (window.location?.pathname || '').replace(/\/+$/, '') || '/';
    const localRoute = ['localhost','127.0.0.1'].includes(host) && path === '/demo';
    if (!localRoute || !elements.demoModeBtn) return false;
    setDemoControlsVisible(false);
    try {
      await window.OZ_AUTH?.waitUntilReady?.();
      const accessToken = await window.OZ_AUTH?.getAccessToken?.();
      if (!accessToken) throw new Error('OWNER_AUTH_REQUIRED');
      await window.OZ_NETWORK.requestJson('/api/oz/context');
      state.demoAuthorized = true;
      setDemoControlsVisible(true);
      setMode('demo');
      return true;
    } catch {
      state.demoAuthorized = false;
      setDemoControlsVisible(false);
      if (elements.contextPill) elements.contextPill.textContent = 'デモ / owner認証が必要';
      return false;
    }
  }

  elements.taskCandidateForm?.addEventListener('submit', async (event) => {
    event.preventDefault(); if (state.submitting) return;
    const form = event.currentTarget; const data = new FormData(form); const dueValue = String(data.get('dueAt') || '');
    const candidate = {title:String(data.get('title') || '').trim(), projectId:String(data.get('projectId') || '') || null, description:String(data.get('description') || '').trim() || null, importance:Number(data.get('importance') || 3), estimatedMinutes:data.get('estimatedMinutes') === '' ? null : Number(data.get('estimatedMinutes')), dueAt:dueValue ? new Date(dueValue).toISOString() : null, executionEnvironment:String(data.get('executionEnvironment') || 'ANY'), timeLane:String(data.get('timeLane') || (dueValue ? 'DUE' : 'SOMEDAY')), assigneeLabel:String(data.get('assigneeLabel') || '').trim() || null, delegationState:String(data.get('delegationState') || 'SELF'), delegateLabel:String(data.get('delegateLabel') || '').trim() || null, travelAllowed:data.get('travelAllowed') === 'on', blockReason:String(data.get('blockReason') || '').trim() || null};
    state.submitting = true; form.querySelector('button').disabled = true; setFeedback(elements.taskCandidateFeedback, '確認待ち候補を作成しています。');
    try { await window.OZ_NETWORK.executeTool('oz_create_task_candidate', candidate, {sourceType:'MANUAL'}); form.reset(); setFeedback(elements.taskCandidateFeedback, '確認待ちへ追加しました。正式タスクは未作成です。', 'success'); }
    catch { setFeedback(elements.taskCandidateFeedback, '候補を作成できませんでした。', 'error'); }
    finally { state.submitting = false; form.querySelector('button').disabled = false; }
  });

  elements.initialCandidateForm?.addEventListener('submit', async (event) => {
    event.preventDefault(); if (state.submitting) return;
    const selectedProjectKeys = [...elements.initialCandidateForm.querySelectorAll('input[name="project-candidate"]:checked')].map((item) => item.value);
    const selectedProjects = selectedProjectKeys.map((key) => state.initialCandidates.find((candidate) => candidate.key === key)).filter(Boolean);
    if (!selectedProjects.length) {
      if (selectedInitialTaskEntries().length) return openInitialTaskConfirmation();
      return setFeedback(elements.initialCandidateFeedback, '登録可能なプロジェクト候補を1件以上選択してください。', 'error');
    }
    state.submitting = true; const button = elements.initialCandidateForm.querySelector('button[type="submit"]'); button.disabled = true; let projectCompleted = 0;
    try {
      for (const candidate of selectedProjects) {
        if (initialCandidateAvailability(candidate).disabled) continue;
        await window.OZ_NETWORK.executeTool('oz_create_project_candidate', {
          name:candidate.name,
          description:candidate.purpose,
          status:candidate.status,
          importance:candidate.importance,
          targetDate:candidate.targetDate,
        }, {sourceType:'MANUAL', idempotencyKey:`initial-project:${candidate.key}:20260825-v1`});
        projectCompleted += 1;
      }
      setFeedback(elements.initialCandidateFeedback, `プロジェクト${projectCompleted}件を確認待ちへ追加しました。正式データは未作成です。`, 'success');
      elements.initialCandidateForm.querySelectorAll('input[name="project-candidate"]').forEach((input) => { input.checked = false; });
    } catch { setFeedback(elements.initialCandidateFeedback, `プロジェクト${projectCompleted}件の後で停止しました。確認待ちを確認してください。`, 'error'); }
    finally { state.submitting = false; renderInitialCandidates(); }
  });

  elements.textForm?.addEventListener('submit', async (event) => {
    event.preventDefault(); const text = String(elements.textInput?.value || '').trim(); if (!text) return;
    if (/おはよう|morning/i.test(text)) { elements.textInput.value = ''; await refreshDailyBrief(); state.rightView = 'oz'; renderRightPanel(); return; }
    if (state.mode === 'live' && window.OZ_LIVE?.sendText) { window.OZ_LIVE.sendText(text); elements.textInput.value = ''; return; }
    elements.textInput.value = ''; if (elements.chatLog) elements.chatLog.innerHTML = '<div class="side-feed"><article class="side-feed-card"><small>私 / ローカル</small><strong>この入力は送信していません。タスク登録は「＋候補を追加」、朝の整理は「OZ、おはよう」を使用してください。</strong></article></div>';
  });

  elements.browserNotificationBtn?.addEventListener('click', async () => {
    if (!('Notification' in window)) { elements.browserNotificationBtn.textContent = '通知非対応'; return; }
    const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
    elements.browserNotificationBtn.textContent = permission === 'granted' ? '通知オン' : '通知オフ';
  });

  window.addEventListener('oz:network-updated', (event) => updateContext(event.detail || {}));
  window.addEventListener('oz:review-selection-changed', () => { if (state.rightView === 'reviews') renderRightPanel(); });
  window.addEventListener('oz:auth-changed', () => { void authorizeLocalDemoRoute(); });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (elements.initialTaskConfirmDialog && !elements.initialTaskConfirmDialog.classList.contains('hidden')) {
        event.preventDefault();
        closeInitialTaskConfirmation();
        return;
      }
      closeTaskDrawer(); closeCandidates(); return;
    }
    const tag = String(event.target?.tagName || '').toUpperCase();
    if (event.key?.toLowerCase() === 'f' && !['INPUT','TEXTAREA','SELECT'].includes(tag)) {
      event.preventDefault();
      void toggleFullscreen();
    }
  });

  window.OZ_WORKSPACE = {
    initialized:true, setMode, setRightView, refreshDailyBrief, proposeTaskStatusChange,
    allowedTaskStatuses, initialCandidateAvailability, initialTaskAvailability,
    syncInitialTaskBulkControls, selectAllAvailableInitialTasks, clearInitialTaskSelection,
    openInitialTaskConfirmation, closeInitialTaskConfirmation, confirmInitialTaskBatch,
    setTaskView:(view) => { if (['TODAY','OVERDUE','WEEK','ALL','COMPLETED'].includes(view)) { state.taskView = view; renderTasks(); } },
    getVisibleTaskCount:() => filterTasks().length, getOpenTaskCount:() => openTasks().length,
    getState:() => ({...state}),
  };
  document.body.dataset.ozMode = 'tasks'; document.body.dataset.ozRightView = 'oz';
  syncFullscreenControl();
  updateClock();
  void authorizeLocalDemoRoute();
  setTimeout(() => { const current = window.OZ_NETWORK?.getState?.(); if (current) updateContext(current); void refreshDailyBrief(); }, 700);
})();
