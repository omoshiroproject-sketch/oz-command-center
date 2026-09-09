(() => {
  const data = window.OZ_DATA;
  const $ = (id) => document.getElementById(id);
  const els = {
    projectList: $('projectList'), projectCount: $('projectCount'), chatLog: $('chatLog'),
    focusText: $('focusText'), focusSub: $('focusSub'), focusEyebrow: $('focusEyebrow'), focusCounter: $('focusCounter'),
    dynamicView: $('dynamicView'), orb: $('orb'), ozState: $('ozState'), ozStateDot: $('ozStateDot'),
    contextPill: $('contextPill'), chatStatus: $('chatStatus'), clock: $('clock'), stageCode: $('stageCode'),
    threadTitle: $('threadTitle'), autoPill: $('autoPill'), projectDrawer: $('projectDrawer'), drawerTitle: $('drawerTitle'),
    drawerProgress: $('drawerProgress'), drawerProgressBar: $('drawerProgressBar'), drawerMeta: $('drawerMeta'), drawerActions: $('drawerActions')
  };

  let index = -1;
  let typingTimer = null;
  let stateTimer = null;
  let autoTimer = null;
  let autoMode = false;
  let cursorTimer = null;
  let chatSequence = [];
  let active = false;

  const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));

  function projectById(id) { return data.projects.find(p => p.id === id); }

  function renderProjects(activeId = null) {
    els.projectCount.textContent = `${String(data.projects.length).padStart(2, '0')} 稼働中`;
    els.projectList.innerHTML = data.projects.map(p => `
      <article class="project-card ${activeId === p.id ? 'active' : ''}" data-project="${escapeHtml(p.id)}" tabindex="0">
        <div class="project-top">
          <div class="project-name">${escapeHtml(p.name)}</div>
          <div class="project-percent">${p.progress}%</div>
        </div>
        <div class="project-status">${escapeHtml(p.status)}</div>
        <div class="progress-track"><div class="progress-value" style="width:${p.progress}%"></div></div>
        <div class="project-meta-row"><span>${escapeHtml(p.phase)}</span><span>${escapeHtml(p.priority)}</span></div>
      </article>
    `).join('');

    els.projectList.querySelectorAll('[data-project]').forEach(card => {
      card.addEventListener('click', () => openProject(card.dataset.project));
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter') openProject(card.dataset.project); });
    });
  }

  function openProject(id) {
    const p = projectById(id);
    if (!p) return;
    els.drawerTitle.textContent = p.name;
    els.drawerProgress.textContent = `${p.progress}%`;
    els.drawerProgressBar.style.width = '0%';
    els.drawerMeta.innerHTML = [
      ['フェーズ', p.phase], ['ステータス', p.status], ['優先度', p.priority], ['担当', p.owner]
    ].map(([k,v]) => `<div class="drawer-meta-card"><span>${escapeHtml(k)}</span><strong>${escapeHtml(v)}</strong></div>`).join('');
    els.drawerActions.innerHTML = p.next.map((v,i) => `<div class="drawer-action"><b>0${i+1}</b>${escapeHtml(v)}</div>`).join('');
    els.projectDrawer.classList.add('open');
    els.projectDrawer.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => { els.drawerProgressBar.style.width = `${p.progress}%`; });
  }

  function closeProject() {
    els.projectDrawer.classList.remove('open');
    els.projectDrawer.setAttribute('aria-hidden', 'true');
  }

  function setState(state = 'idle') {
    const labels = { idle:'待機中', listening:'聞き取り中', thinking:'考え中', speaking:'応答中' };
    const colors = { idle:'#59636c', listening:'#d8f2ff', thinking:'#eed6a4', speaking:'#a7efc5' };
    els.orb.className = `orb ${state}`;
    els.ozState.textContent = labels[state] || state.toUpperCase();
    els.chatStatus.textContent = labels[state] || state.toUpperCase();
    els.stageCode.textContent = `OZ / ${labels[state] || state.toUpperCase()}`;
    els.ozStateDot.style.background = colors[state] || colors.idle;
    els.ozStateDot.style.boxShadow = state === 'idle' ? 'none' : `0 0 10px ${colors[state]}`;
  }

  function typeText(text, speed = 14) {
    clearInterval(typingTimer);
    els.focusText.textContent = '';
    let i = 0;
    typingTimer = setInterval(() => {
      i += 1;
      els.focusText.textContent = text.slice(0, i);
      if (i >= text.length) clearInterval(typingTimer);
    }, speed);
  }

  function nowTime() {
    return new Date().toLocaleTimeString('ja-JP', { hour:'2-digit', minute:'2-digit', hour12:false });
  }

  function renderChat() {
    if (!chatSequence.length) {
      els.chatLog.innerHTML = `<div class="chat-empty"><span class="empty-pulse"></span>会話ストリームの準備完了</div>`;
      return;
    }
    els.chatLog.innerHTML = chatSequence.slice(-6).map((m, i, arr) => {
      let cls = 'chat-message';
      const age = arr.length - 1 - i;
      if (age === 0) cls += ' current';
      else if (age === 1) cls += ' mid';
      else if (age >= 4) cls += ' faded';
      else cls += ' old';
      if (m.speaker === 'OZ') cls += ' oz';
      return `<div class="${cls}">
        <div class="chat-speaker-row"><span class="chat-speaker">${escapeHtml(m.speaker)}</span><span class="chat-time">${escapeHtml(m.time)}</span></div>
        <div class="chat-copy">${escapeHtml(m.text)}</div>
      </div>`;
    }).join('');
  }

  function pushChat(scene) {
    chatSequence.push({ speaker: scene.speaker, text: scene.text, time: nowTime() });
    renderChat();
  }

  function renderView(view) {
    if (!view) {
      els.dynamicView.classList.add('hidden');
      els.dynamicView.innerHTML = '';
      return;
    }
    els.dynamicView.classList.remove('hidden');
    const head = `<div class="view-head"><div><div class="view-kicker">動的インテリジェンス</div><div class="view-title">${escapeHtml(view.title)}</div></div><div class="view-badge">${escapeHtml(view.badge || 'ライブ')}</div></div>`;

    if (view.type === 'metrics') {
      els.dynamicView.innerHTML = head + `<div class="metric-grid">${view.metrics.map(m => `<div class="metric" style="--meter:${Number(m[3] || 60)}%"><div class="metric-label">${escapeHtml(m[0])}</div><div class="metric-value">${escapeHtml(m[1])}</div><div class="metric-sub">${escapeHtml(m[2])}</div></div>`).join('')}</div>`;
      return;
    }
    if (view.type === 'idea') {
      els.dynamicView.innerHTML = head + `<div class="idea-list">${view.items.map((item,i) => `<div class="idea-row"><div class="idea-num">アイデア 0${i+1}</div><div class="idea-copy">${escapeHtml(item)}</div></div>`).join('')}</div>`;
      return;
    }
    if (view.type === 'task') {
      els.dynamicView.innerHTML = head + `<div class="task-list">${view.items.map((item,i) => `<div class="task-row"><div class="task-num">0${i+1}</div><div class="task-copy">${escapeHtml(item)}</div></div>`).join('')}</div>`;
      return;
    }
    if (view.type === 'project') {
      els.dynamicView.innerHTML = head + `<div class="project-view">
        <div class="project-focus"><span>進捗</span><strong>${escapeHtml(view.progress)}</strong></div>
        <div class="project-stat"><small>現在</small><b>${escapeHtml(view.current)}</b><small>次 / ${escapeHtml(view.next)}</small></div>
        <div class="project-stat"><small>注意</small><b>${escapeHtml(view.risk)}</b><small>OZリスクシグナル</small></div>
      </div>`;
      return;
    }
    if (view.type === 'decision') {
      els.dynamicView.innerHTML = head + `<div class="decision-grid">${view.options.map((o,i) => `<div class="decision-card ${i === 0 ? 'recommend' : ''}"><span class="view-kicker">${i === 0 ? '推奨' : '別案'}</span><strong>${escapeHtml(o[0])}</strong><p>${escapeHtml(o[1])}</p></div>`).join('')}</div>`;
    }
  }

  function setCategory(category = 'STRATEGY') {
    document.querySelectorAll('#contextTags span').forEach(el => el.classList.toggle('active', el.dataset.contextTag === category));
  }

  function applyScene(scene, sceneIndex, skipThinking = false) {
    clearTimeout(stateTimer);
    renderProjects(scene.project || null);
    els.contextPill.textContent = scene.context || 'GENERAL';
    els.threadTitle.textContent = scene.context || 'GENERAL / OZ';
    els.focusCounter.textContent = `${String(sceneIndex + 1).padStart(2,'0')} / ${String(data.scenes.length).padStart(2,'0')}`;
    els.focusEyebrow.textContent = scene.speaker === 'OZ' ? 'OZの応答' : 'ユーザー入力';
    els.focusSub.textContent = scene.sub || '';
    setCategory(scene.category || 'STRATEGY');

    const commit = () => {
      setState(scene.state || 'idle');
      typeText(scene.text, scene.speaker === 'OZ' ? 11 : 8);
      renderView(scene.view || null);
      pushChat(scene);
      scheduleAuto();
    };

    if (scene.speaker === 'OZ' && !skipThinking) {
      setState('thinking');
      els.focusEyebrow.textContent = 'OZが処理中';
      els.focusText.textContent = '…';
      els.focusSub.textContent = 'コンテキスト整理 / 応答生成';
      renderView(null);
      stateTimer = setTimeout(commit, 520);
    } else {
      commit();
    }
  }

  function showScene(newIndex, opts = {}) {
    clearTimeout(autoTimer);
    if (newIndex < 0) return reset();
    if (newIndex >= data.scenes.length) {
      if (autoMode) newIndex = 0;
      else { syncDemoControls(); return; }
    }
    index = newIndex;
    syncDemoControls();
    applyScene(data.scenes[index], index, Boolean(opts.skipThinking));
  }

  function next() { showScene(index + 1); }
  function prev() { if (index > 0) showScene(index - 1, { skipThinking:true }); }

  function syncDemoControls() {
    const prevButton = document.querySelector('[data-action="prev"]');
    const nextButton = document.querySelector('[data-action="next"]');
    const autoButton = document.querySelector('[data-action="auto"]');
    if (prevButton) prevButton.disabled = !active || index <= 0;
    if (nextButton) nextButton.disabled = !active || (!autoMode && index >= data.scenes.length - 1);
    if (autoButton) {
      autoButton.disabled = !active;
      autoButton.setAttribute('aria-pressed', String(autoMode));
    }
  }

  function reset() {
    clearInterval(typingTimer);
    clearTimeout(stateTimer);
    clearTimeout(autoTimer);
    index = -1;
    chatSequence = [];
    setState('idle');
    renderProjects();
    renderChat();
    renderView(null);
    els.contextPill.textContent = '全体';
    els.threadTitle.textContent = '全体 / OZ';
    els.focusEyebrow.textContent = '準備完了';
    els.focusCounter.textContent = `00 / ${String(data.scenes.length).padStart(2,'0')}`;
    els.focusText.textContent = 'SPACEキーでOZとのセッションを開始';
    els.focusSub.textContent = '計画 / 戦略 / クリエイティブ / プロジェクト分析';
    setCategory('STRATEGY');
    syncDemoControls();
  }

  function scheduleAuto() {
    clearTimeout(autoTimer);
    if (!autoMode || index < 0) return;
    const scene = data.scenes[index];
    const delay = scene.speaker === 'OZ' ? 4100 : 2400;
    autoTimer = setTimeout(() => showScene(index + 1), delay);
  }

  function toggleAuto() {
    autoMode = !autoMode;
    els.autoPill.textContent = autoMode ? '自動' : '手動';
    els.autoPill.classList.toggle('active', autoMode);
    if (autoMode) {
      if (index < 0) showScene(0);
      else scheduleAuto();
    } else clearTimeout(autoTimer);
    syncDemoControls();
  }

  function restartCursorTimer() {
    document.body.classList.remove('hide-cursor');
    clearTimeout(cursorTimer);
    if (!active) return;
    cursorTimer = setTimeout(() => document.body.classList.add('hide-cursor'), 1800);
  }

  document.addEventListener('keydown', (e) => {
    if (!active) return;
    if (els.projectDrawer.classList.contains('open') && e.key === 'Escape') { closeProject(); return; }
    if (e.code === 'Space') { e.preventDefault(); next(); }
    else if (e.code === 'ArrowRight') next();
    else if (e.code === 'ArrowLeft') prev();
    else if (e.key.toLowerCase() === 'r') reset();
    else if (e.key.toLowerCase() === 'a') toggleAuto();
  });

  document.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!active) return;
      const action = btn.dataset.action;
      if (action === 'next') next();
      if (action === 'prev') prev();
      if (action === 'auto') toggleAuto();
    });
  });
  document.querySelectorAll('[data-close-drawer]').forEach(el => el.addEventListener('click', closeProject));
  document.addEventListener('mousemove', restartCursorTimer);
  document.addEventListener('click', restartCursorTimer);

  window.OZ_DEMO_APP = {
    start() {
      active = true;
      reset();
      restartCursorTimer();
    },
    stop() {
      active = false;
      autoMode = false;
      syncDemoControls();
      clearInterval(typingTimer);
      clearTimeout(stateTimer);
      clearTimeout(autoTimer);
      clearTimeout(cursorTimer);
      document.body.classList.remove('hide-cursor');
      closeProject();
    },
  };
  restartCursorTimer();
})();
