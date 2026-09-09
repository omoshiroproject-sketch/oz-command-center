(() => {
  'use strict';

  if (window.OZ_LIVE?.initialized) return;
  const $ = (id) => document.getElementById(id);
  const elements = {
    liveModeBtn:$('liveModeBtn'), liveConnectBtn:$('liveConnectBtn'), tasksModeBtn:$('tasksModeBtn'), demoModeBtn:$('demoModeBtn'),
    chatLog:$('chatLog'), chatStatus:$('chatStatus'), threadTitle:$('threadTitle'), contextPill:$('contextPill'), autoPill:$('autoPill'),
    orb:$('orb'), ozState:$('ozState'), ozStateDot:$('ozStateDot'), stageCode:$('stageCode'), wakeStatus:$('wakeStatus'),
    toolApproval:$('toolApproval'), toolApprovalTitle:$('toolApprovalTitle'), toolApprovalCopy:$('toolApprovalCopy'),
    toolApproveBtn:$('toolApproveBtn'), toolRejectBtn:$('toolRejectBtn'),
  };
  const labels = {
    idle:'待機中', listening:'聞き取り中', thinking:'考え中', speaking:'応答中', connecting:'接続中',
    reconnecting:'再接続中', tool_calling:'処理中', awaiting_approval:'承認待ち', error:'エラー',
  };
  const toolGroups = Object.freeze({
    read:new Set(['oz_get_context','oz_get_daily_brief','oz_get_task','oz_list_projects','oz_list_reviews','oz_list_tasks']),
    candidate:new Set(['oz_create_project_candidate','oz_create_task_candidate','oz_propose_task_status_change','oz_propose_task_update']),
    review:new Set(['oz_resolve_review']),
    external:new Set(['oz_propose_external_action']),
    bulk_review:new Set(['oz_prepare_project_review_batch','oz_confirm_project_review_batch']),
  });
  const live = {
    initialized:true, desired:false, connected:false, connecting:false, pc:null, dc:null, stream:null, audio:null,
    expiryTimer:null, reconnectTimer:null, reconnectAttempts:0, maxReconnectAttempts:2, connectionEpoch:0,
    handledCalls:new Set(), toolRuns:new Map(), pendingApproval:null,
    pendingVoiceBatch:null, voiceBatchRuns:new Map(), userTurnSerial:0, lastUserTranscript:'', lastUserTranscriptTurn:0,
    renderedResponseKeys:new Set(), assistantChannels:new Map(), turnAssistantTexts:new Set(),
    connectionMeasurements:{session:null, clientSecret:null, microphone:null, webrtc:null},
    chat:[], assistantDraft:'', userDraft:'', state:'idle',
  };
  const escapeHtml = (value='') => String(value).replace(/[&<>'"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[char]));
  const nowTime = () => new Date().toLocaleTimeString('ja-JP', {hour:'2-digit', minute:'2-digit', hour12:false});

  function measure(method, ...args) {
    try { return window.OZ_LATENCY?.[method]?.(...args) ?? null; }
    catch { return null; }
  }
  function toolCategory(name) {
    for (const [category, names] of Object.entries(toolGroups)) if (names.has(name)) return category;
    return 'other';
  }
  function startConnectionMeasurement(key, kind) {
    const sequence = measure('connectionStarted', kind);
    live.connectionMeasurements[key] = Number.isInteger(sequence) ? sequence : null;
    return sequence;
  }
  function finishConnectionMeasurement(key, outcome) {
    const sequence = live.connectionMeasurements[key];
    live.connectionMeasurements[key] = null;
    if (Number.isInteger(sequence)) measure('connectionFinished', sequence, outcome);
  }
  function finishPendingConnectionMeasurements(outcome) {
    finishConnectionMeasurement('clientSecret', outcome);
    finishConnectionMeasurement('microphone', outcome);
    finishConnectionMeasurement('webrtc', outcome);
  }
  function finishConnectionSession(outcome) { finishConnectionMeasurement('session', outcome); }
  function connectionSessionSequence() { return live.connectionMeasurements.session; }
  function recordConnectionVoiceEvent(event) {
    const sequence = connectionSessionSequence();
    if (Number.isInteger(sequence)) measure('connectionVoiceEvent', sequence, event);
  }
  function recordResponseFinished(outcome) {
    const recorded = measure('responseFinished', outcome);
    if (outcome === 'cancelled' && recorded === true) recordConnectionVoiceEvent('cancelled');
  }
  function appliedMicrophoneProcessingSettings(stream) {
    try {
      const tracks = stream?.getAudioTracks?.() || stream?.getTracks?.() || [];
      const settings = tracks[0]?.getSettings?.() || {};
      const safeValue = (name) => typeof settings[name] === 'boolean' ? settings[name] : 'unknown';
      return {
        echoCancellation:safeValue('echoCancellation'),
        noiseSuppression:safeValue('noiseSuppression'),
        autoGainControl:safeValue('autoGainControl'),
      };
    } catch {
      return {echoCancellation:'unknown', noiseSuppression:'unknown', autoGainControl:'unknown'};
    }
  }

  async function authenticatedFetch(url, options={}) {
    await window.OZ_AUTH?.waitUntilReady?.();
    const accessToken = await window.OZ_AUTH?.getAccessToken?.();
    const headers = new Headers(options.headers || {});
    if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
    return fetch(url, {...options, headers, cache:'no-store'});
  }

  function setState(value, message='') {
    live.state = value;
    const stateLabel = labels[value] || String(value).toUpperCase();
    const orbState = ['listening','thinking','speaking'].includes(value) ? value : 'idle';
    elements.orb?.classList.remove('idle','listening','thinking','speaking'); elements.orb?.classList.add(orbState);
    if (elements.ozState) elements.ozState.textContent = stateLabel;
    if (elements.chatStatus && document.body.dataset.ozMode === 'live') elements.chatStatus.textContent = stateLabel;
    if (elements.stageCode && document.body.dataset.ozMode === 'live') elements.stageCode.textContent = `OZ / ${stateLabel}`;
    if (elements.ozStateDot) {
      const color = value === 'speaking' ? '#b8ffdf' : value === 'thinking' || value === 'tool_calling' || value === 'awaiting_approval' ? '#f3df9a' : value === 'listening' ? '#68f2ff' : value === 'error' ? '#c58e8e' : '#66727e';
      elements.ozStateDot.style.background = color; elements.ozStateDot.style.boxShadow = orbState === 'idle' ? 'none' : `0 0 10px ${color}`;
    }
    if (elements.wakeStatus) elements.wakeStatus.textContent = message || stateLabel;
    document.body.dataset.ozState = value;
  }

  function renderChat() {
    if (!elements.chatLog || document.body.dataset.ozMode !== 'live' || (document.body.dataset.ozRightView || 'oz') !== 'oz') return;
    const items = live.chat.slice(-8);
    const draft = live.assistantDraft ? {speaker:'OZ', text:live.assistantDraft, time:nowTime(), draft:true} : live.userDraft ? {speaker:'YOU', text:live.userDraft, time:nowTime(), draft:true} : null;
    if (draft) items.push(draft);
    if (!items.length) { elements.chatLog.innerHTML = '<div class="chat-empty"><span class="empty-pulse"></span>LIVE OZ / 音声接続の準備完了</div>'; return; }
    elements.chatLog.innerHTML = items.map((item, index) => `<div class="chat-message live-chat-item ${item.speaker === 'OZ' ? 'oz' : ''} ${item.draft ? 'draft' : ''} ${index === items.length - 1 ? 'current' : 'old'}"><div class="chat-speaker-row"><span class="chat-speaker">${escapeHtml(item.speaker)}</span><span class="chat-time">${escapeHtml(item.time)}</span></div><div class="chat-copy">${escapeHtml(item.text)}</div></div>`).join('');
    elements.chatLog.scrollTop = elements.chatLog.scrollHeight;
  }

  function pushChat(speaker, text) {
    const clean = String(text || '').trim(); if (!clean) return;
    const previous = live.chat.at(-1); if (previous?.speaker === speaker && previous?.text === clean) return;
    live.chat.push({speaker, text:clean, time:nowTime()}); renderChat();
  }

  function normalizedText(value) { return String(value || '').trim().replace(/\s+/g, ' '); }
  function responseKey(event) { return String(event?.response_id || event?.response?.id || event?.item?.response_id || ''); }
  function pushAssistantResponse(event, text) {
    const clean = normalizedText(text); if (!clean) return;
    const key = responseKey(event);
    if ((key && live.renderedResponseKeys.has(key)) || live.turnAssistantTexts.has(clean)) return;
    if (key) live.renderedResponseKeys.add(key);
    live.turnAssistantTexts.add(clean); pushChat('OZ', clean);
  }
  function resetTurnDedupe() {
    live.toolRuns.clear(); live.turnAssistantTexts.clear(); live.assistantChannels.clear();
  }

  function renderConnectionControl() {
    if (!elements.liveConnectBtn) return;
    const liveMode = document.body.dataset.ozMode === 'live';
    const active = live.desired || live.connecting || live.connected;
    elements.liveConnectBtn.classList.toggle('hidden', !liveMode);
    elements.liveConnectBtn.classList.toggle('connected', live.connected);
    elements.liveConnectBtn.textContent = active ? '音声を終了' : '音声を開始';
    elements.liveConnectBtn.setAttribute('aria-pressed', String(active));
    elements.liveConnectBtn.setAttribute('aria-label', active ? 'マイクとRealtime音声を終了' : 'マイクとRealtime音声を開始');
    elements.liveConnectBtn.title = active ? 'マイクとRealtime音声を安全に終了します' : 'マイクとRealtime音声を開始します';
  }

  function cleanupPeer() {
    clearTimeout(live.expiryTimer); live.expiryTimer = null;
    try { live.dc?.close(); } catch {}
    try { live.pc?.close(); } catch {}
    live.stream?.getTracks?.().forEach((track) => track.stop());
    if (live.audio) { live.audio.srcObject = null; live.audio.remove(); }
    live.pc = null; live.dc = null; live.stream = null; live.audio = null; live.connected = false; live.connecting = false;
    document.body.dataset.liveConnected = 'false';
    renderConnectionControl();
  }

  function disconnect({preserveDesired=false}={}) {
    if (!preserveDesired) live.desired = false;
    finishPendingConnectionMeasurements('cancelled');
    finishConnectionSession('cancelled');
    live.connectionEpoch += 1;
    clearTimeout(live.reconnectTimer); live.reconnectTimer = null;
    cleanupPeer(); hideApproval(); live.pendingVoiceBatch = null; live.assistantDraft = ''; live.userDraft = '';
    if (document.body.dataset.ozMode === 'live') setState('idle', '音声：切断済み');
    renderChat(); renderConnectionControl();
  }

  function scheduleReconnect() {
    finishPendingConnectionMeasurements('failed');
    finishConnectionSession('failed');
    cleanupPeer();
    if (!live.desired || document.body.dataset.ozMode !== 'live') return;
    if (live.reconnectAttempts >= live.maxReconnectAttempts) { live.desired = false; renderConnectionControl(); setState('error', '音声：再接続上限'); pushChat('システム', 'Realtime接続を復旧できませんでした。タスク機能は利用できます。'); return; }
    measure('connectionEvent', 'reconnect_scheduled');
    live.reconnectAttempts += 1; setState('reconnecting', `再接続 ${live.reconnectAttempts}/${live.maxReconnectAttempts}`);
    live.reconnectTimer = setTimeout(() => void connect({reconnect:true}), 800 * (2 ** (live.reconnectAttempts - 1)));
  }

  function responseText(event) {
    const output = event?.response?.output || []; const chunks = [];
    output.forEach((item) => (item.content || []).forEach((content) => { if (content.transcript) chunks.push(content.transcript); else if (content.text) chunks.push(content.text); }));
    return chunks.join(' ').trim();
  }
  function parseArguments(value) { if (value && typeof value === 'object') return value; try { return JSON.parse(value || '{}'); } catch { return {}; } }
  function sendEvent(event) {
    if (live.dc?.readyState !== 'open') return false;
    live.dc.send(JSON.stringify(event));
    return true;
  }
  function sendToolOutput(callId, output, requestResponse=true, measurementSequence=null) {
    const returned = sendEvent({type:'conversation.item.create', item:{type:'function_call_output', call_id:callId, output:JSON.stringify(output)}});
    if (returned && Number.isInteger(measurementSequence)) measure('toolResultReturned', measurementSequence);
    if (requestResponse) sendEvent({type:'response.create'});
  }

  function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
    return value;
  }
  function toolSignature(name, args) { return `${name}:${JSON.stringify(stableValue(args))}`; }

  function isExplicitVoiceConfirmation(value) {
    const text = normalizedText(value).replace(/[。.!！?？]+$/g, '');
    if (!text || /(いいえ|違|やめ|待っ|中止|キャンセル|まだ|保留)/.test(text)) return false;
    if (/^(はい|ええ|うん)([、,\s]*(承認|実行|登録|進め)(して|してください|で|ます)?.*)?$/.test(text)) return true;
    return /(承認して|実行して|登録して|その内容で進めて|この内容で進めて)/.test(text);
  }

  function voiceBatchFailure(callId, code, measurementSequence=null) {
    if (Number.isInteger(measurementSequence)) measure('toolFinished', measurementSequence, 'failed');
    sendToolOutput(callId, {ok:false, code, data:{requiresNewPreparation:true}}, true, measurementSequence);
    setState('listening');
  }

  async function runVoiceBatchFunction(item) {
    const callId = item?.call_id || item?.id;
    const name = item?.name;
    if (!callId || !name || live.handledCalls.has(callId)) return;
    live.handledCalls.add(callId);
    const args = parseArguments(item.arguments);
    setState('tool_calling', name === 'oz_prepare_project_review_batch' ? '確認対象を照合中' : '最終承認を照合中');

    if (name === 'oz_prepare_project_review_batch') {
      const decision = args.decision;
      if (!['APPROVED','REJECTED','NEEDS_EDIT'].includes(decision) || !window.OZ_NETWORK?.prepareReviewBatch) {
        const measurementSequence = measure('toolStarted', 'bulk_review');
        voiceBatchFailure(callId, 'BATCH_PREPARATION_INVALID', measurementSequence);
        return;
      }
      const signature = `${toolSignature(name, {decision})}:turn:${live.userTurnSerial}`;
      let run = live.toolRuns.get(signature);
      const primary = !run;
      if (!run) {
        const measurementSequence = measure('toolStarted', 'bulk_review');
        const promise = Promise.resolve().then(() => {
          const plan = window.OZ_NETWORK.prepareReviewBatch({decision});
          const confirmationId = crypto.randomUUID();
          live.pendingVoiceBatch = {
            confirmationId,
            plan,
            preparedTurnSerial:live.userTurnSerial,
            connectionEpoch:live.connectionEpoch,
            executed:false
          };
          return {
            ok:true,
            code:'PROJECT_REVIEW_BATCH_PREPARED',
            data:{
              confirmationId,
              decision:plan.decision,
              count:plan.count,
              names:plan.names,
              formalProjectsWillBeCreated:plan.decision === 'APPROVED',
              initialTaskCandidatesAutoCreated:false,
              requiresSecondConfirmation:true
            }
          };
        }).catch(() => ({ok:false, code:'NO_PENDING_PROJECT_REVIEWS', data:{requiresNewPreparation:true}}))
          .then((output) => {
            if (Number.isInteger(measurementSequence)) measure('toolFinished', measurementSequence, output.ok ? 'success' : 'failed');
            return output;
          });
        run = {promise, measurementSequence};
        live.toolRuns.set(signature, run);
      }
      const output = await run.promise;
      sendToolOutput(callId, output, primary, primary ? run.measurementSequence : null);
      setState(output.ok ? 'thinking' : 'listening');
      return;
    }

    const confirmationId = String(args.confirmationId || '');
    const priorRun = live.voiceBatchRuns.get(confirmationId);
    if (priorRun) {
      sendToolOutput(callId, await priorRun.promise, false);
      return;
    }
    const pending = live.pendingVoiceBatch;
    const immediateNextTurn = pending && live.userTurnSerial === pending.preparedTurnSerial + 1;
    const transcriptMatchesTurn = live.lastUserTranscriptTurn === live.userTurnSerial;
    const explicit = transcriptMatchesTurn && isExplicitVoiceConfirmation(live.lastUserTranscript);
    if (!pending || pending.confirmationId !== confirmationId || pending.connectionEpoch !== live.connectionEpoch || pending.executed || !immediateNextTurn || !explicit || !window.OZ_NETWORK?.executeReviewBatch) {
      const measurementSequence = measure('toolStarted', 'bulk_review');
      voiceBatchFailure(callId, 'EXPLICIT_SECOND_CONFIRMATION_REQUIRED', measurementSequence);
      return;
    }
    pending.executed = true;
    const measurementSequence = measure('toolStarted', 'bulk_review');
    const promise = window.OZ_NETWORK.executeReviewBatch(pending.plan, {sourceType:'VOICE', measurementSequence})
      .then((result) => ({
        ok:result.failureCount === 0,
        code:result.successCount === 0 ? 'PROJECT_REVIEW_BATCH_FAILED' : result.failureCount ? 'PROJECT_REVIEW_BATCH_PARTIAL' : 'PROJECT_REVIEW_BATCH_RESOLVED',
        data:{
          decision:pending.plan.decision,
          total:result.total,
          successCount:result.successCount,
          failureCount:result.failureCount,
          results:result.results.map((entry) => ({name:entry.name, ok:entry.ok, code:entry.code})),
          initialTaskCandidatesAutoCreated:false
        }
      }))
      .catch(() => ({ok:false, code:'PROJECT_REVIEW_BATCH_FAILED', data:{successCount:0, failureCount:pending.plan.count}}))
      .then((output) => {
        if (Number.isInteger(measurementSequence)) measure('toolFinished', measurementSequence, output.ok ? 'success' : 'failed');
        return output;
      });
    live.voiceBatchRuns.set(confirmationId, {promise, measurementSequence});
    const output = await promise;
    live.pendingVoiceBatch = null;
    sendToolOutput(callId, output, true, measurementSequence);
    setState(output.ok ? 'thinking' : 'error', output.ok ? '' : '一括確認に一部失敗');
  }

  async function runFunctionCall(item, explicitApproval=false) {
    const callId = item?.call_id || item?.id; const name = item?.name;
    if (!callId || !name || live.handledCalls.has(callId)) return;
    live.handledCalls.add(callId); setState('tool_calling', 'OZツールを実行中');
    const args = parseArguments(item.arguments); const signature = toolSignature(name, args);
    let run = live.toolRuns.get(signature); const primary = !run;
    if (!run) {
      const measurementSequence = measure('toolStarted', toolCategory(name));
      const promise = (async () => {
        try {
          if (!window.OZ_NETWORK?.executeTool) throw new Error('TOOL_UNAVAILABLE');
          const output = await window.OZ_NETWORK.executeTool(name, args, {idempotencyKey:`realtime:${callId}`, sourceType:'VOICE', explicitApproval, measurementSequence});
          if (Number.isInteger(measurementSequence)) measure('toolFinished', measurementSequence, output?.ok === false ? 'failed' : 'success');
          return {ok:true, output};
        } catch {
          if (Number.isInteger(measurementSequence)) measure('toolFinished', measurementSequence, 'failed');
          return {ok:false, output:{ok:false, code:'TOOL_FAILED', data:{}}};
        }
      })();
      run = {promise, measurementSequence}; live.toolRuns.set(signature, run);
    }
    const result = await run.promise;
    sendToolOutput(callId, result.output, primary, primary ? run.measurementSequence : null);
    if (result.ok) setState('thinking');
    else {
      setState('error', 'ツール実行エラー');
      if (primary) pushChat('システム', 'OZツールを完了できませんでした。正式データの状態を確認してください。');
    }
  }

  function showFunctionApproval(item) {
    const callId = item?.call_id || item?.id;
    if (!callId || live.handledCalls.has(callId) || (live.pendingApproval?.type === 'function' && (live.pendingApproval.item?.call_id || live.pendingApproval.item?.id) === callId)) return;
    live.pendingApproval = {type:'function', item};
    if (elements.toolApprovalTitle) elements.toolApprovalTitle.textContent = 'OZからの操作候補';
    if (elements.toolApprovalCopy) elements.toolApprovalCopy.textContent = '最終承認・外部操作を行う候補です。内容を確認してください。';
    elements.toolApproval?.classList.remove('hidden'); setState('awaiting_approval', 'オーナー承認が必要です');
  }
  function showMcpApproval(event) {
    live.pendingApproval = {type:'mcp', item:event};
    if (elements.toolApprovalTitle) elements.toolApprovalTitle.textContent = '接続アプリからの操作候補';
    if (elements.toolApprovalCopy) elements.toolApprovalCopy.textContent = '接続先へ送る操作です。承認するまで実行されません。';
    elements.toolApproval?.classList.remove('hidden'); setState('awaiting_approval', '接続アプリの承認が必要です');
  }
  function hideApproval() { live.pendingApproval = null; elements.toolApproval?.classList.add('hidden'); }
  function answerApproval(approve) {
    const pending = live.pendingApproval; hideApproval(); if (!pending) return;
    if (pending.type === 'function') {
      if (approve) void runFunctionCall(pending.item, true);
      else {
        const callId = pending.item.call_id || pending.item.id;
        const measurementSequence = measure('toolStarted', toolCategory(pending.item.name));
        live.handledCalls.add(callId);
        if (Number.isInteger(measurementSequence)) measure('toolFinished', measurementSequence, 'cancelled');
        sendToolOutput(callId, {ok:false, code:'OWNER_REJECTED', data:{}}, true, measurementSequence);
        setState('listening');
      }
      return;
    }
    const approvalId = pending.item.approval_request_id || pending.item.item_id || pending.item.id;
    sendEvent({type:'conversation.item.create', item:{type:'mcp_approval_response', approval_request_id:approvalId, approve, ...(!approve ? {reason:'Owner rejected the action.'} : {})}});
    if (approve) sendEvent({type:'response.create'}); setState(approve ? 'thinking' : 'listening');
  }

  function responseOutcome(event) {
    const status = String(event?.response?.status || '').toLowerCase();
    if (status === 'cancelled') return 'cancelled';
    if (status === 'failed' || status === 'incomplete') return 'failed';
    return 'success';
  }

  function handleEvent(event) {
    switch (event.type) {
      case 'session.created': case 'session.updated': setState('listening', '音声：準備完了'); break;
      case 'input_audio_buffer.speech_started': { const recorded = measure('speechStarted'); if (Number.isInteger(recorded)) recordConnectionVoiceEvent('speech_started'); resetTurnDedupe(); live.userTurnSerial += 1; live.lastUserTranscript = ''; live.lastUserTranscriptTurn = live.userTurnSerial; setState('listening'); live.userDraft = ''; break; }
      case 'input_audio_buffer.speech_stopped': { const recorded = measure('speechStopped'); if (recorded === true) recordConnectionVoiceEvent('speech_stopped'); setState('thinking'); break; }
      case 'conversation.item.input_audio_transcription.delta': live.userDraft += event.delta || ''; renderChat(); break;
      case 'conversation.item.input_audio_transcription.completed': measure('transcriptCompleted'); live.lastUserTranscript = normalizedText(event.transcript || live.userDraft); live.lastUserTranscriptTurn = live.userTurnSerial; pushChat('YOU', live.lastUserTranscript); live.userDraft = ''; break;
      case 'response.created': measure('responseCreated'); setState('thinking'); break;
      case 'response.output_audio.delta': case 'response.audio.delta': measure('firstAudioDelta'); setState('speaking'); break;
      case 'response.output_audio_transcript.delta': case 'response.audio_transcript.delta': {
        measure('firstAudioTranscriptDelta');
        const key = responseKey(event) || 'active'; const channel = live.assistantChannels.get(key);
        if (!channel) live.assistantChannels.set(key, event.type);
        if (!channel || channel === event.type) { live.assistantDraft += event.delta || ''; renderChat(); }
        break;
      }
      case 'response.output_audio_transcript.done': case 'response.audio_transcript.done': {
        const key = responseKey(event) || 'active'; const channel = live.assistantChannels.get(key);
        if (!channel || channel === event.type || channel.replace('.delta', '.done') === event.type) pushAssistantResponse(event, event.transcript || live.assistantDraft);
        live.assistantChannels.delete(key); live.assistantDraft = ''; break;
      }
      case 'response.output_item.done': if (event.item?.type === 'function_call') {
        if (['oz_prepare_project_review_batch','oz_confirm_project_review_batch'].includes(event.item.name)) void runVoiceBatchFunction(event.item);
        else {
          const explicit = ['oz_resolve_review','oz_propose_external_action'].includes(event.item.name);
          if (explicit) showFunctionApproval(event.item); else void runFunctionCall(event.item);
        }
      } break;
      case 'conversation.item.done': if (event.item?.type === 'mcp_approval_request') showMcpApproval(event.item); break;
      case 'response.done': { recordResponseFinished(responseOutcome(event)); const text = responseText(event); if (text) pushAssistantResponse(event, text); live.assistantDraft = ''; if (!live.pendingApproval) setState('listening'); break; }
      case 'response.cancelled': recordResponseFinished('cancelled'); break;
      case 'mcp_approval_request': showMcpApproval(event); break;
      case 'error': setState('error', 'Realtime処理エラー'); pushChat('システム', 'Realtime処理でエラーが発生しました。Secretや本文はログへ保存していません。'); break;
    }
  }

  async function connect({reconnect=false}={}) {
    if (live.connected || live.connecting) return;
    const attempt = ++live.connectionEpoch;
    live.desired = true; live.connecting = true; renderConnectionControl(); setState(reconnect ? 'reconnecting' : 'connecting', reconnect ? '音声：再接続中' : '音声：接続中');
    try {
      startConnectionMeasurement('session', 'session');
      startConnectionMeasurement('clientSecret', 'client_secret');
      const secretResponse = await authenticatedFetch('/api/realtime/client-secret', {method:'POST'});
      const secretPayload = await secretResponse.json().catch(() => ({}));
      if (!secretResponse.ok || typeof secretPayload.value !== 'string') throw new Error(secretPayload?.error?.code || 'REALTIME_NOT_CONFIGURED');
      finishConnectionMeasurement('clientSecret', 'success');
      if (!live.desired || attempt !== live.connectionEpoch) return;
      startConnectionMeasurement('microphone', 'microphone');
      const stream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true, noiseSuppression:true, autoGainControl:true}});
      finishConnectionMeasurement('microphone', 'success');
      const sessionSequence = connectionSessionSequence();
      if (Number.isInteger(sessionSequence)) measure('microphoneProcessingSettings', sessionSequence, appliedMicrophoneProcessingSettings(stream));
      if (!live.desired || attempt !== live.connectionEpoch) { stream.getTracks().forEach((track) => track.stop()); return; }
      startConnectionMeasurement('webrtc', 'webrtc');
      const pc = new RTCPeerConnection(); const audio = document.createElement('audio'); audio.autoplay = true; audio.hidden = true; document.body.appendChild(audio);
      audio.addEventListener('playing', () => { const sequence = connectionSessionSequence(); if (Number.isInteger(sequence)) measure('connectionMarker', sequence, 'audio_element_playing'); }, {once:true});
      pc.ontrack = (event) => { const sequence = connectionSessionSequence(); if (Number.isInteger(sequence)) measure('connectionMarker', sequence, 'remote_audio_track_received'); audio.srcObject = event.streams[0]; };
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      const dc = pc.createDataChannel('oai-events');
      live.pc = pc; live.dc = dc; live.stream = stream; live.audio = audio;
      dc.onopen = () => {
        if (!live.desired || attempt !== live.connectionEpoch) { stream.getTracks().forEach((track) => track.stop()); try { pc.close(); } catch {} return; }
        finishConnectionMeasurement('webrtc', 'success');
        live.connected = true; live.connecting = false; live.reconnectAttempts = 0; document.body.dataset.liveConnected = 'true';
        renderConnectionControl();
        setState('listening', '音声：準備完了'); pushChat('システム', 'LIVE OZへ接続しました。音声は保存しません。');
      };
      dc.onmessage = (message) => { try { handleEvent(JSON.parse(message.data)); } catch { setState('error', 'イベント解析エラー'); } };
      pc.onconnectionstatechange = () => { if (attempt === live.connectionEpoch && ['failed','disconnected'].includes(pc.connectionState) && live.desired) scheduleReconnect(); };
      const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
      const answerResponse = await fetch('https://api.openai.com/v1/realtime/calls', {method:'POST', headers:{authorization:`Bearer ${secretPayload.value}`,'content-type':'application/sdp'}, body:offer.sdp});
      if (!answerResponse.ok) throw new Error('REALTIME_NEGOTIATION_FAILED');
      await pc.setRemoteDescription({type:'answer', sdp:await answerResponse.text()});
      if (Number.isFinite(secretPayload.expiresAt)) {
        const delay = Math.max(1000, secretPayload.expiresAt * 1000 - Date.now() - 5000);
        live.expiryTimer = setTimeout(() => { if (attempt !== live.connectionEpoch) return; measure('connectionEvent', 'connection_timeout'); setState('reconnecting', '音声セッション期限切れ'); if (live.desired) scheduleReconnect(); }, delay);
      }
    } catch (error) {
      if (!live.desired || attempt !== live.connectionEpoch) return;
      const outcome = error?.name === 'TimeoutError' ? 'timeout' : 'failed';
      finishPendingConnectionMeasurements(outcome);
      finishConnectionSession(outcome);
      const microphoneDenied = error?.name === 'NotAllowedError' || error?.name === 'SecurityError';
      const shouldReconnect = reconnect && live.desired;
      if (!shouldReconnect) live.desired = false;
      cleanupPeer(); setState('error', microphoneDenied ? 'マイクの許可が必要です' : error?.message === 'OPENAI_NOT_CONFIGURED' ? 'LIVE OZ：未設定' : 'LIVE OZ：利用不可');
      pushChat('システム', microphoneDenied ? 'マイクを許可してから「音声を開始」を押してください。タスク機能は利用できます。' : 'LIVE OZは現在利用できません。タスク機能は引き続き利用できます。');
      if (shouldReconnect) scheduleReconnect();
    }
  }

  function enterLive() {
    window.OZ_WORKSPACE?.setMode?.('live');
    document.body.dataset.ozMode = 'live'; live.desired = true;
    window.OZ_WORKSPACE?.setRightView?.('oz'); renderConnectionControl();
    if (elements.autoPill) elements.autoPill.textContent = 'ライブ';
    if (elements.contextPill) elements.contextPill.textContent = 'LIVE OZ';
    if (elements.threadTitle) elements.threadTitle.textContent = 'LIVE OZ / REALTIME';
    renderChat(); if (!live.connected) void connect();
  }
  function sendText(text) {
    if (live.dc?.readyState !== 'open') { pushChat('システム', 'LIVE OZへ接続してから送信してください。'); return false; }
    resetTurnDedupe(); live.userTurnSerial += 1; live.lastUserTranscript = normalizedText(text); live.lastUserTranscriptTurn = live.userTurnSerial; pushChat('YOU', text); sendEvent({type:'conversation.item.create', item:{type:'message', role:'user', content:[{type:'input_text', text}]}}); sendEvent({type:'response.create'}); setState('thinking'); return true;
  }

  elements.liveModeBtn?.addEventListener('click', enterLive);
  elements.liveConnectBtn?.addEventListener('click', () => { if (live.connected || live.connecting) disconnect(); else { live.desired = true; void connect(); } });
  elements.tasksModeBtn?.addEventListener('click', () => disconnect()); elements.demoModeBtn?.addEventListener('click', () => disconnect());
  elements.toolApproveBtn?.addEventListener('click', () => answerApproval(true)); elements.toolRejectBtn?.addEventListener('click', () => answerApproval(false));
  window.addEventListener('oz:mode-requested', (event) => { if (event.detail?.mode !== 'live') disconnect(); renderConnectionControl(); });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && (live.desired || live.connecting || live.connected)) { event.preventDefault?.(); disconnect(); }
  });

  window.OZ_LIVE = {initialized:true, connect, disconnect, sendText, renderChat, getState:() => ({state:live.state, connected:live.connected, reconnectAttempts:live.reconnectAttempts, userTurnSerial:live.userTurnSerial, hasPendingVoiceBatch:Boolean(live.pendingVoiceBatch)})};
  setState('idle', '音声：任意'); renderConnectionControl();
})();
