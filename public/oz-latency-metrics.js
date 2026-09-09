(() => {
  'use strict';

  if (window.OZ_LATENCY?.initialized) return;

  const SCHEMA_VERSION = 2;
  const BUFFER_CAPACITY = 256;
  const scopes = new Set(['connection', 'voice_turn', 'tool']);
  const outcomes = new Set(['success', 'failed', 'cancelled', 'timeout']);
  const connectionKinds = new Set(['session', 'client_secret', 'microphone', 'webrtc']);
  const connectionEvents = new Set(['reconnect_scheduled', 'connection_timeout']);
  const connectionVoiceEvents = new Set(['speech_started', 'speech_stopped', 'cancelled']);
  const assistantResponsePhases = new Set(['in_progress', 'after_response', 'before_response']);
  const microphoneSettingValues = new Set([true, false, 'unknown']);
  const toolCategories = new Set(['read', 'candidate', 'review', 'external', 'bulk_review', 'other']);
  const metrics = new Set([
    'session_started', 'session_duration',
    'client_secret_started', 'client_secret_duration',
    'microphone_started', 'microphone_duration',
    'webrtc_started', 'webrtc_duration',
    'reconnect_scheduled', 'connection_timeout',
    'remote_audio_track_received', 'audio_element_playing',
    'microphone_processing_settings',
    'connection_speech_started', 'connection_speech_stopped', 'connection_cancelled',
    'speech_started', 'speech_stopped', 'transcript_completed',
    'response_created', 'first_audio_delta', 'response_done', 'response_cancelled',
    'voice_turn_duration', 'first_output_audio_transcript_delta',
    'speech_stop_to_transcript', 'speech_stop_to_response_created',
    'speech_stop_to_first_audio', 'speech_stop_to_first_output_audio_transcript',
    'response_created_to_first_output_audio_transcript', 'response_total',
    'tool_started', 'network_started', 'network_duration',
    'context_refresh_started', 'context_refresh_duration',
    'tool_result_returned', 'tool_duration',
    'tool_done_to_response_created', 'tool_done_to_first_audio',
    'tool_done_to_first_output_audio_transcript',
  ]);

  let diagnosticsEnabled = false;
  let entrySequence = 0;
  let connectionSequence = 0;
  let turnSequence = 0;
  let responseSequence = 0;
  let toolSequence = 0;
  let droppedEntries = 0;
  let entries = [];
  let activeTurnSequence = null;
  let activeResponse = null;
  let hasFinishedResponse = false;
  let cancellationEventRecorded = false;
  const connections = new Map();
  const turns = new Map();
  const tools = new Map();

  function monotonicNow() {
    const value = performance.now();
    return Number.isFinite(value) && value >= 0 ? value : null;
  }

  function roundedDuration(start, end) {
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
    return Math.round((end - start) * 1000) / 1000;
  }

  function boundedSet(map, key, value) {
    map.set(key, value);
    while (map.size > BUFFER_CAPACITY) map.delete(map.keys().next().value);
  }

  function append(scope, correlationSequence, metric, optional={}) {
    if (!scopes.has(scope) || !Number.isInteger(correlationSequence) || correlationSequence < 1 || !metrics.has(metric)) return false;
    const entry = {
      sequence: ++entrySequence,
      scope,
      correlationSequence,
      metric,
    };
    if (outcomes.has(optional.outcome)) entry.outcome = optional.outcome;
    if (Number.isFinite(optional.durationMs) && optional.durationMs >= 0) entry.durationMs = optional.durationMs;
    if (scope === 'tool' && toolCategories.has(optional.toolCategory)) entry.toolCategory = optional.toolCategory;
    if (typeof optional.assistantResponseActive === 'boolean') entry.assistantResponseActive = optional.assistantResponseActive;
    if (assistantResponsePhases.has(optional.assistantResponsePhase)) entry.assistantResponsePhase = optional.assistantResponsePhase;
    if (metric === 'microphone_processing_settings') {
      for (const name of ['echoCancellation', 'noiseSuppression', 'autoGainControl']) {
        if (microphoneSettingValues.has(optional[name])) entry[name] = optional[name];
      }
    }
    entries.push(Object.freeze(entry));
    if (entries.length > BUFFER_CAPACITY) {
      entries.shift();
      droppedEntries += 1;
    }
    return true;
  }

  function connectionStarted(kind) {
    if (!connectionKinds.has(kind)) return null;
    const startedAt = monotonicNow();
    if (startedAt === null) return null;
    const sequence = ++connectionSequence;
    boundedSet(connections, sequence, {kind, startedAt, finished:false});
    append('connection', sequence, `${kind}_started`);
    if (kind === 'session') {
      hasFinishedResponse = false;
      cancellationEventRecorded = false;
    }
    return sequence;
  }

  function connectionFinished(sequence, outcome='success') {
    const connection = connections.get(sequence);
    if (!connection || connection.finished || !outcomes.has(outcome)) return false;
    const finishedAt = monotonicNow();
    connection.finished = true;
    const durationMs = roundedDuration(connection.startedAt, finishedAt);
    append('connection', sequence, `${connection.kind}_duration`, {outcome, durationMs});
    return durationMs !== null;
  }

  function connectionEvent(metric) {
    if (!connectionEvents.has(metric)) return false;
    const sequence = ++connectionSequence;
    return append('connection', sequence, metric, metric === 'connection_timeout' ? {outcome:'timeout'} : {});
  }

  function connectionMarker(sequence, metric) {
    const connection = connections.get(sequence);
    if (!connection || connection.kind !== 'session' || connection.finished) return false;
    if (!['remote_audio_track_received', 'audio_element_playing'].includes(metric) || connection[metric]) return false;
    const recordedAt = monotonicNow();
    if (recordedAt === null) return false;
    connection[metric] = true;
    return append('connection', sequence, metric, {durationMs:roundedDuration(connection.startedAt, recordedAt)});
  }

  function microphoneProcessingSettings(sequence, settings={}) {
    const connection = connections.get(sequence);
    if (!connection || connection.kind !== 'session' || connection.finished || connection.microphoneSettingsRecorded) return false;
    connection.microphoneSettingsRecorded = true;
    return append('connection', sequence, 'microphone_processing_settings', {
      echoCancellation:microphoneSettingValues.has(settings.echoCancellation) ? settings.echoCancellation : 'unknown',
      noiseSuppression:microphoneSettingValues.has(settings.noiseSuppression) ? settings.noiseSuppression : 'unknown',
      autoGainControl:microphoneSettingValues.has(settings.autoGainControl) ? settings.autoGainControl : 'unknown',
    });
  }

  function connectionVoiceEvent(sequence, event) {
    const connection = connections.get(sequence);
    if (!connection || connection.kind !== 'session' || connection.finished || !connectionVoiceEvents.has(event)) return false;
    return append('connection', sequence, `connection_${event}`);
  }

  function speechStarted() {
    const startedAt = monotonicNow();
    if (startedAt === null) return null;
    const sequence = ++turnSequence;
    activeTurnSequence = sequence;
    const assistantResponseActive = Boolean(activeResponse && !activeResponse.finished);
    const assistantResponsePhase = assistantResponseActive ? 'in_progress' : hasFinishedResponse ? 'after_response' : 'before_response';
    boundedSet(turns, sequence, {
      sequence,
      speechStartedAt:startedAt,
      speechStoppedAt:null,
      transcriptCompletedAt:null,
      firstResponseCreatedAt:null,
      firstAudioAt:null,
      firstAudioTranscriptAt:null,
      cancellationRecorded:false,
    });
    append('voice_turn', sequence, 'speech_started', {assistantResponseActive, assistantResponsePhase});
    return sequence;
  }

  function turnForSpeechEvent(sequence) {
    if (Number.isInteger(sequence) && turns.has(sequence)) return turns.get(sequence);
    return turns.get(activeTurnSequence) || null;
  }

  function speechStopped(sequence) {
    const turn = turnForSpeechEvent(sequence);
    if (!turn || turn.speechStoppedAt !== null) return false;
    const stoppedAt = monotonicNow();
    if (stoppedAt === null) return false;
    turn.speechStoppedAt = stoppedAt;
    append('voice_turn', turn.sequence, 'speech_stopped');
    const durationMs = roundedDuration(turn.speechStartedAt, stoppedAt);
    if (durationMs !== null) append('voice_turn', turn.sequence, 'voice_turn_duration', {durationMs});
    addTurnDerivedDurations(turn);
    return true;
  }

  function unresolvedTranscriptTurn() {
    for (const turn of turns.values()) {
      if (turn.speechStoppedAt !== null && turn.transcriptCompletedAt === null) return turn;
    }
    return turns.get(activeTurnSequence) || null;
  }

  function transcriptCompleted(sequence) {
    const turn = Number.isInteger(sequence) ? turns.get(sequence) : unresolvedTranscriptTurn();
    if (!turn || turn.transcriptCompletedAt !== null) return false;
    const completedAt = monotonicNow();
    if (completedAt === null) return false;
    turn.transcriptCompletedAt = completedAt;
    append('voice_turn', turn.sequence, 'transcript_completed');
    addTurnDerivedDurations(turn);
    return true;
  }

  function turnForResponse(sequence) {
    if (Number.isInteger(sequence) && turns.has(sequence)) return turns.get(sequence);
    const active = turns.get(activeTurnSequence);
    if (active && active.speechStoppedAt !== null) return active;
    const available = [...turns.values()].filter((turn) => turn.speechStoppedAt !== null);
    return available.at(-1) || active || null;
  }

  function addTurnDerivedDurations(turn) {
    if (!turn || turn.speechStoppedAt === null) return;
    const candidates = [
      ['transcriptCompletedAt', 'speech_stop_to_transcript'],
      ['firstResponseCreatedAt', 'speech_stop_to_response_created'],
      ['firstAudioAt', 'speech_stop_to_first_audio'],
      ['firstAudioTranscriptAt', 'speech_stop_to_first_output_audio_transcript'],
    ];
    for (const [field, metric] of candidates) {
      const marker = `${field}Recorded`;
      if (turn[marker] || turn[field] === null) continue;
      const durationMs = roundedDuration(turn.speechStoppedAt, turn[field]);
      if (durationMs === null) continue;
      turn[marker] = true;
      append('voice_turn', turn.sequence, metric, {durationMs});
    }
  }

  function responseCreated(sequence) {
    if (activeResponse && !activeResponse.finished) return activeResponse.sequence;
    const createdAt = monotonicNow();
    if (createdAt === null) return null;
    const turn = turnForResponse(sequence);
    cancellationEventRecorded = false;
    const sequenceValue = ++responseSequence;
    activeResponse = {
      sequence:sequenceValue,
      turnSequence:turn?.sequence || null,
      createdAt,
      firstAudioAt:null,
      firstAudioTranscriptAt:null,
      finished:false,
      toolSequences:[],
    };
    if (turn) {
      turn.cancellationRecorded = false;
      append('voice_turn', turn.sequence, 'response_created');
      if (turn.firstResponseCreatedAt === null) {
        turn.firstResponseCreatedAt = createdAt;
        addTurnDerivedDurations(turn);
      }
    }
    for (const tool of tools.values()) {
      if (tool.doneAt === null || tool.resultReturnedAt === null || tool.nextResponseCreatedAt !== null || createdAt < tool.doneAt) continue;
      tool.nextResponseCreatedAt = createdAt;
      activeResponse.toolSequences.push(tool.sequence);
      const durationMs = roundedDuration(tool.doneAt, createdAt);
      if (durationMs !== null) append('tool', tool.sequence, 'tool_done_to_response_created', {durationMs, toolCategory:tool.category});
    }
    return sequenceValue;
  }

  function firstAudioTranscriptDelta() {
    const receivedAt = monotonicNow();
    if (receivedAt === null) return false;
    const response = activeResponse && !activeResponse.finished ? activeResponse : null;
    const turn = response ? turns.get(response.turnSequence) : turnForResponse();
    if (!turn || turn.firstAudioTranscriptAt !== null || (response && response.firstAudioTranscriptAt !== null)) return false;

    if (response) response.firstAudioTranscriptAt = receivedAt;
    append('voice_turn', turn.sequence, 'first_output_audio_transcript_delta');
    turn.firstAudioTranscriptAt = receivedAt;
    addTurnDerivedDurations(turn);
    if (response) {
      const durationMs = roundedDuration(response.createdAt, receivedAt);
      if (durationMs !== null) append('voice_turn', turn.sequence, 'response_created_to_first_output_audio_transcript', {durationMs});
    }
    if (response) {
      for (const sequence of response.toolSequences) {
        const tool = tools.get(sequence);
        if (!tool || tool.firstAudioTranscriptRecorded || tool.doneAt === null) continue;
        const durationMs = roundedDuration(tool.doneAt, receivedAt);
        if (durationMs === null) continue;
        tool.firstAudioTranscriptRecorded = true;
        append('tool', tool.sequence, 'tool_done_to_first_output_audio_transcript', {durationMs, toolCategory:tool.category});
      }
    }
    return true;
  }

  function firstAudioDelta() {
    if (!activeResponse || activeResponse.finished || activeResponse.firstAudioAt !== null) return false;
    const receivedAt = monotonicNow();
    if (receivedAt === null) return false;
    activeResponse.firstAudioAt = receivedAt;
    const turn = turns.get(activeResponse.turnSequence);
    if (turn) {
      append('voice_turn', turn.sequence, 'first_audio_delta');
      if (turn.firstAudioAt === null) {
        turn.firstAudioAt = receivedAt;
        addTurnDerivedDurations(turn);
      }
    }
    for (const sequence of activeResponse.toolSequences) {
      const tool = tools.get(sequence);
      if (!tool || tool.firstAudioRecorded || tool.doneAt === null) continue;
      const durationMs = roundedDuration(tool.doneAt, receivedAt);
      if (durationMs === null) continue;
      tool.firstAudioRecorded = true;
      append('tool', tool.sequence, 'tool_done_to_first_audio', {durationMs, toolCategory:tool.category});
    }
    return true;
  }

  function responseFinished(outcome='success') {
    if (!outcomes.has(outcome)) return false;
    if (outcome === 'cancelled' && cancellationEventRecorded) return false;
    if (!activeResponse || activeResponse.finished) {
      if (outcome !== 'cancelled') return false;
      const turn = turnForResponse();
      if (!turn || turn.cancellationRecorded) return false;
      turn.cancellationRecorded = true;
      cancellationEventRecorded = true;
      append('voice_turn', turn.sequence, 'response_cancelled', {outcome, assistantResponseActive:false});
      hasFinishedResponse = true;
      return true;
    }
    const finishedAt = monotonicNow();
    if (finishedAt === null) return false;
    const assistantResponseActive = !activeResponse.finished;
    activeResponse.finished = true;
    const turn = turns.get(activeResponse.turnSequence);
    if (turn) {
      if (outcome === 'cancelled') turn.cancellationRecorded = true;
      if (outcome === 'cancelled') cancellationEventRecorded = true;
      append('voice_turn', turn.sequence, outcome === 'cancelled' ? 'response_cancelled' : 'response_done', {outcome, ...(outcome === 'cancelled' ? {assistantResponseActive} : {})});
      const durationMs = roundedDuration(activeResponse.createdAt, finishedAt);
      if (durationMs !== null) append('voice_turn', turn.sequence, 'response_total', {outcome, durationMs});
    }
    activeResponse = null;
    hasFinishedResponse = true;
    return true;
  }

  function toolStarted(category='other') {
    const safeCategory = toolCategories.has(category) ? category : 'other';
    const startedAt = monotonicNow();
    if (startedAt === null) return null;
    const sequence = ++toolSequence;
    boundedSet(tools, sequence, {
      sequence,
      category:safeCategory,
      startedAt,
      networkStartedAt:null,
      networkFinished:false,
      contextStartedAt:null,
      contextFinished:false,
      doneAt:null,
      resultReturnedAt:null,
      nextResponseCreatedAt:null,
      firstAudioRecorded:false,
      firstAudioTranscriptRecorded:false,
    });
    append('tool', sequence, 'tool_started', {toolCategory:safeCategory});
    return sequence;
  }

  function toolNetworkStarted(sequence) {
    const tool = tools.get(sequence);
    if (!tool || tool.networkStartedAt !== null) return false;
    const startedAt = monotonicNow();
    if (startedAt === null) return false;
    tool.networkStartedAt = startedAt;
    append('tool', sequence, 'network_started', {toolCategory:tool.category});
    return true;
  }

  function toolNetworkFinished(sequence, outcome='success') {
    const tool = tools.get(sequence);
    if (!tool || tool.networkStartedAt === null || tool.networkFinished || !outcomes.has(outcome)) return false;
    const finishedAt = monotonicNow();
    tool.networkFinished = true;
    const durationMs = roundedDuration(tool.networkStartedAt, finishedAt);
    append('tool', sequence, 'network_duration', {outcome, durationMs, toolCategory:tool.category});
    return durationMs !== null;
  }

  function contextRefreshStarted(sequence) {
    const tool = tools.get(sequence);
    if (!tool || tool.contextStartedAt !== null) return false;
    const startedAt = monotonicNow();
    if (startedAt === null) return false;
    tool.contextStartedAt = startedAt;
    append('tool', sequence, 'context_refresh_started', {toolCategory:tool.category});
    return true;
  }

  function contextRefreshFinished(sequence, outcome='success') {
    const tool = tools.get(sequence);
    if (!tool || tool.contextStartedAt === null || tool.contextFinished || !outcomes.has(outcome)) return false;
    const finishedAt = monotonicNow();
    tool.contextFinished = true;
    const durationMs = roundedDuration(tool.contextStartedAt, finishedAt);
    append('tool', sequence, 'context_refresh_duration', {outcome, durationMs, toolCategory:tool.category});
    return durationMs !== null;
  }

  function toolFinished(sequence, outcome='success') {
    const tool = tools.get(sequence);
    if (!tool || tool.doneAt !== null || !outcomes.has(outcome)) return false;
    const finishedAt = monotonicNow();
    if (finishedAt === null) return false;
    tool.doneAt = finishedAt;
    const durationMs = roundedDuration(tool.startedAt, finishedAt);
    append('tool', sequence, 'tool_duration', {outcome, durationMs, toolCategory:tool.category});
    return durationMs !== null;
  }

  function toolResultReturned(sequence) {
    const tool = tools.get(sequence);
    if (!tool || tool.resultReturnedAt !== null) return false;
    const returnedAt = monotonicNow();
    if (returnedAt === null) return false;
    tool.resultReturnedAt = returnedAt;
    append('tool', sequence, 'tool_result_returned', {toolCategory:tool.category});
    return true;
  }

  function localDiagnosticsAllowed() {
    return ['localhost', '127.0.0.1', '::1'].includes(String(window.location?.hostname || '').toLowerCase());
  }

  function enableDiagnostics() {
    diagnosticsEnabled = localDiagnosticsAllowed();
    return diagnosticsEnabled;
  }

  function disableDiagnostics() {
    diagnosticsEnabled = false;
    return true;
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
    return value;
  }

  function getSnapshot() {
    if (!diagnosticsEnabled) return null;
    return deepFreeze({
      schemaVersion:SCHEMA_VERSION,
      audioStartProxy:'output_audio_transcript_delta',
      audioElementPlayingScope:'connection',
      physicalSpeakerPlaybackMeasured:false,
      capacity:BUFFER_CAPACITY,
      entryCount:entries.length,
      droppedEntries,
      entries:entries.map((entry) => ({...entry})),
    });
  }

  function reset() {
    entrySequence = 0;
    connectionSequence = 0;
    turnSequence = 0;
    responseSequence = 0;
    toolSequence = 0;
    droppedEntries = 0;
    entries = [];
    activeTurnSequence = null;
    activeResponse = null;
    hasFinishedResponse = false;
    cancellationEventRecorded = false;
    connections.clear();
    turns.clear();
    tools.clear();
    return true;
  }

  function shield(operation, fallback=null) {
    return (...args) => {
      try { return operation(...args); }
      catch { return fallback; }
    };
  }

  window.OZ_LATENCY = Object.freeze({
    initialized:true,
    schemaVersion:SCHEMA_VERSION,
    enableDiagnostics:shield(enableDiagnostics, false),
    disableDiagnostics:shield(disableDiagnostics, false),
    getSnapshot:shield(getSnapshot, null),
    reset:shield(reset, false),
    connectionStarted:shield(connectionStarted, null),
    connectionFinished:shield(connectionFinished, false),
    connectionEvent:shield(connectionEvent, false),
    connectionMarker:shield(connectionMarker, false),
    microphoneProcessingSettings:shield(microphoneProcessingSettings, false),
    connectionVoiceEvent:shield(connectionVoiceEvent, false),
    speechStarted:shield(speechStarted, null),
    speechStopped:shield(speechStopped, false),
    transcriptCompleted:shield(transcriptCompleted, false),
    responseCreated:shield(responseCreated, null),
    firstAudioDelta:shield(firstAudioDelta, false),
    firstAudioTranscriptDelta:shield(firstAudioTranscriptDelta, false),
    responseFinished:shield(responseFinished, false),
    toolStarted:shield(toolStarted, null),
    toolNetworkStarted:shield(toolNetworkStarted, false),
    toolNetworkFinished:shield(toolNetworkFinished, false),
    contextRefreshStarted:shield(contextRefreshStarted, false),
    contextRefreshFinished:shield(contextRefreshFinished, false),
    toolFinished:shield(toolFinished, false),
    toolResultReturned:shield(toolResultReturned, false),
  });
})();
