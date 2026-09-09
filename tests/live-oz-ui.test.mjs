import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(path.join(root, "public/live-oz.js"), "utf8");
const metricsSource = await readFile(path.join(root, "public/oz-latency-metrics.js"), "utf8");

function element(initialClasses = []) {
  const classes = new Set(initialClasses);
  const listeners = new Map();
  const attributes = new Map();
  return {
    listeners, attributes, dataset: {}, style: {}, textContent: "", innerHTML: "", title: "", srcObject: null,
    scrollTop: 0, scrollHeight: 0,
    classList: {
      add(...names) { names.forEach((name) => classes.add(name)); },
      remove(...names) { names.forEach((name) => classes.delete(name)); },
      contains(name) { return classes.has(name); },
      toggle(name, force) {
        if (force === undefined) force = !classes.has(name);
        if (force) classes.add(name); else classes.delete(name);
        return force;
      },
    },
    addEventListener(type, listener) {
      const current = listeners.get(type) ?? [];
      current.push(listener); listeners.set(type, current);
    },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    getAttribute(name) { return attributes.get(name) ?? null; },
    appendChild() {}, remove() {},
  };
}

function runtime(options = {}) {
  const ids = new Map();
  const documentListeners = new Map();
  const windowListeners = new Map();
  const body = element();
  body.dataset.ozMode = "tasks"; body.dataset.ozRightView = "oz";
  body.appendChild = () => {};
  const get = (id) => {
    if (!ids.has(id)) ids.set(id, element(id === "liveConnectBtn" ? ["live-connect", "hidden"] : []));
    return ids.get(id);
  };

  let stopCount = 0;
  let toolCalls = 0;
  let lastToolOptions = null;
  let batchPreparations = 0;
  let batchExecutions = 0;
  let dataChannel = null;
  let metricsNow = 0;
  let remoteAudio = null;

  const track = {
    kind: "audio",
    stop() { stopCount += 1; },
    getSettings() {
      if (options.throwingTrackSettings) throw new Error("settings unavailable");
      return {
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: true,
        deviceId: "must-not-enter-metrics",
        groupId: "must-not-enter-metrics",
        label: "must-not-enter-metrics",
      };
    },
  };
  const stream = { getTracks() { return [track]; }, getAudioTracks() { return [track]; } };

  class MockDataChannel {
    constructor() { this.readyState = "open"; this.sent = []; }
    send(value) { this.sent.push(JSON.parse(value)); }
    close() { this.readyState = "closed"; }
  }

  class MockPeerConnection {
    constructor() { this.connectionState = "new"; this.channel = null; MockPeerConnection.latest = this; }
    addTrack() {}
    createDataChannel() { this.channel = new MockDataChannel(); dataChannel = this.channel; return this.channel; }
    async createOffer() { return { type: "offer", sdp: "local-offer" }; }
    async setLocalDescription() {}
    async setRemoteDescription() { this.connectionState = "connected"; this.channel?.onopen?.(); }
    close() { this.connectionState = "closed"; }
  }

  const document = {
    body,
    getElementById: get,
    createElement(tagName) { const value = element(); if (tagName === "audio") remoteAudio = value; return value; },
    addEventListener(type, listener) {
      const current = documentListeners.get(type) ?? [];
      current.push(listener); documentListeners.set(type, current);
    },
  };

  class CustomEvent {
    constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
  }

  const window = {
    OZ_AUTH: {
      async waitUntilReady() {},
      async getAccessToken() { return "test-access-token-not-a-secret"; },
    },
    OZ_NETWORK: {
      async executeTool(_name, _args, toolOptions) {
        toolCalls += 1; lastToolOptions = toolOptions;
        if (toolOptions?.measurementSequence && window.OZ_LATENCY && !options.throwingMetrics) {
          window.OZ_LATENCY.toolNetworkStarted(toolOptions.measurementSequence);
          window.OZ_LATENCY.toolNetworkFinished(toolOptions.measurementSequence, "success");
          window.OZ_LATENCY.contextRefreshStarted(toolOptions.measurementSequence);
          window.OZ_LATENCY.contextRefreshFinished(toolOptions.measurementSequence, "success");
        }
        return { ok: true, code: "TASK_CANDIDATE_CREATED", data: { requiresApproval: true } };
      },
      prepareReviewBatch({decision}) {
        batchPreparations += 1;
        return { id:"isolated-plan", kind:"PROJECT_CREATE", status:"PENDING", decision, reviewIds:["review-one", "review-two"], names:["Project One", "Project Two"], count:2 };
      },
      async executeReviewBatch(plan, executionOptions) {
        batchExecutions += 1;
        lastToolOptions = executionOptions;
        return options.batchResult ?? { total:plan.count, successCount:plan.count, failureCount:0, results:plan.names.map((name) => ({name, ok:true, code:"RESOLVED"})) };
      },
    },
    addEventListener(type, listener) {
      const current = windowListeners.get(type) ?? [];
      current.push(listener); windowListeners.set(type, current);
    },
    dispatchEvent(event) { (windowListeners.get(event.type) ?? []).forEach((listener) => listener(event)); },
    location: { hostname: "127.0.0.1" },
  };
  if (options.throwingMetrics) {
    window.OZ_LATENCY = new Proxy({}, { get() { throw new Error("isolated metrics failure"); } });
  }
  window.OZ_WORKSPACE = {
    setMode(mode) { body.dataset.ozMode = mode; window.dispatchEvent(new CustomEvent("oz:mode-requested", { detail: { mode } })); },
    setRightView(view) { body.dataset.ozRightView = view; },
  };

  const context = vm.createContext({
    window, document, navigator: { mediaDevices: { async getUserMedia() { return stream; } } },
    RTCPeerConnection: MockPeerConnection, Headers, Response, CustomEvent, crypto, console: { error() {} },
    performance: { now() { metricsNow += 1; return metricsNow; } },
    fetch: async (url) => String(url).includes("/api/realtime/client-secret")
      ? Response.json({ value: "ephemeral-test-value", expiresAt: 1_900_000_000 })
      : new Response("remote-answer", { status: 200 }),
    setTimeout() { return 1; }, clearTimeout() {},
  });
  if (options.realMetrics) vm.runInContext(metricsSource, context);
  vm.runInContext(source, context);

  return {
    body, get, window,
    get dataChannel() { return dataChannel; },
    get peerConnection() { return MockPeerConnection.latest; },
    get remoteAudio() { return remoteAudio; },
    get stopCount() { return stopCount; },
    get toolCalls() { return toolCalls; },
    get batchPreparations() { return batchPreparations; },
    get batchExecutions() { return batchExecutions; },
    get lastToolOptions() { return lastToolOptions; },
    async fire(elementValue, type, event = {}) {
      for (const listener of elementValue.listeners.get(type) ?? []) await listener(event);
    },
    async keydown(key) {
      for (const listener of documentListeners.get("keydown") ?? []) await listener({ key, preventDefault() {} });
    },
  };
}

async function settle() {
  for (let index = 0; index < 5; index += 1) await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
}

test("LIVE OZ exposes a Japanese disconnect control and Escape stops Realtime plus microphone", async () => {
  const app = runtime();
  const control = app.get("liveConnectBtn");
  assert.equal(control.classList.contains("hidden"), true);

  await app.fire(app.get("liveModeBtn"), "click");
  await settle();
  assert.equal(app.window.OZ_LIVE.getState().connected, true);
  assert.equal(control.classList.contains("hidden"), false);
  assert.equal(control.textContent, "音声を終了");
  assert.equal(control.getAttribute("aria-pressed"), "true");

  await app.keydown("Escape");
  assert.equal(app.window.OZ_LIVE.getState().connected, false);
  assert.equal(app.stopCount, 1);
  assert.equal(control.textContent, "音声を開始");
  assert.equal(control.getAttribute("aria-pressed"), "false");
});

test("one voice turn executes an equivalent tool once and renders one completion message", async () => {
  const app = runtime();
  app.body.dataset.ozMode = "live";
  await app.window.OZ_LIVE.connect();
  const channel = app.dataChannel;
  assert.ok(channel);

  channel.onmessage({ data: JSON.stringify({ type: "input_audio_buffer.speech_started" }) });
  const args = JSON.stringify({ title: "voice candidate", importance: 3 });
  channel.onmessage({ data: JSON.stringify({ type: "response.output_item.done", item: { type: "function_call", call_id: "call-primary", name: "oz_create_task_candidate", arguments: args } }) });
  channel.onmessage({ data: JSON.stringify({ type: "response.output_item.done", item: { type: "function_call", call_id: "call-duplicate", name: "oz_create_task_candidate", arguments: args } }) });
  await settle();

  assert.equal(app.toolCalls, 1);
  assert.equal(app.lastToolOptions.idempotencyKey, "realtime:call-primary");
  const outputs = channel.sent.filter((event) => event.type === "conversation.item.create" && event.item?.type === "function_call_output");
  const responseCreates = channel.sent.filter((event) => event.type === "response.create");
  assert.equal(outputs.length, 2);
  assert.equal(responseCreates.length, 1);

  const message = "確認待ち候補を作成しました。";
  channel.onmessage({ data: JSON.stringify({ type: "response.output_audio_transcript.done", response_id: "response-one", transcript: message }) });
  channel.onmessage({ data: JSON.stringify({ type: "response.done", response: { id: "response-one", output: [{ content: [{ transcript: message }] }] } }) });
  const occurrences = app.get("chatLog").innerHTML.split(message).length - 1;
  assert.equal(occurrences, 1);
});

test("metrics exceptions cannot stop connection, voice events, or tool execution", async () => {
  const app = runtime({ throwingMetrics: true });
  app.body.dataset.ozMode = "live";
  await assert.doesNotReject(() => app.window.OZ_LIVE.connect());
  const channel = app.dataChannel;
  assert.ok(channel);
  assert.doesNotThrow(() => app.peerConnection.ontrack({ streams: [{ kind: "remote-media-stream" }] }));
  await assert.doesNotReject(() => app.fire(app.remoteAudio, "playing"));

  assert.doesNotThrow(() => channel.onmessage({ data: JSON.stringify({ type: "input_audio_buffer.speech_started" }) }));
  assert.doesNotThrow(() => channel.onmessage({ data: JSON.stringify({ type: "input_audio_buffer.speech_stopped" }) }));
  assert.doesNotThrow(() => channel.onmessage({ data: JSON.stringify({ type: "response.created" }) }));
  assert.doesNotThrow(() => channel.onmessage({ data: JSON.stringify({ type: "response.output_audio.delta", delta: "mock-only" }) }));
  assert.doesNotThrow(() => channel.onmessage({ data: JSON.stringify({ type: "response.output_audio_transcript.delta", delta: "mock-only" }) }));
  assert.doesNotThrow(() => channel.onmessage({ data: JSON.stringify({ type: "response.done", response: { status: "completed", output: [] } }) }));
  channel.onmessage({ data: JSON.stringify({ type: "response.output_item.done", item: { type: "function_call", call_id: "isolated-call", name: "oz_create_task_candidate", arguments: "{}" } }) });
  await settle();

  assert.equal(app.window.OZ_LIVE.getState().connected, true);
  assert.equal(app.toolCalls, 1);
});

test("unavailable microphone settings stay unknown without stopping the connection", async () => {
  const app = runtime({ realMetrics: true, throwingTrackSettings: true });
  app.body.dataset.ozMode = "live";
  app.window.OZ_LATENCY.enableDiagnostics();
  await assert.doesNotReject(() => app.window.OZ_LIVE.connect());
  assert.equal(app.window.OZ_LIVE.getState().connected, true);
  const settings = app.window.OZ_LATENCY.getSnapshot().entries.find((entry) => entry.metric === "microphone_processing_settings");
  assert.deepEqual(
    {echoCancellation:settings.echoCancellation, noiseSuppression:settings.noiseSuppression, autoGainControl:settings.autoGainControl},
    {echoCancellation:"unknown", noiseSuppression:"unknown", autoGainControl:"unknown"},
  );
});

test("mock Realtime events populate the local metrics runtime through the production hooks", async () => {
  const app = runtime({ realMetrics: true });
  app.body.dataset.ozMode = "live";
  assert.equal(app.window.OZ_LATENCY.enableDiagnostics(), true);
  await app.window.OZ_LIVE.connect();
  const channel = app.dataChannel;
  app.peerConnection.ontrack({ streams: [{ kind: "remote-media-stream" }] });
  await app.fire(app.remoteAudio, "playing");

  channel.onmessage({ data: JSON.stringify({ type: "input_audio_buffer.speech_started" }) });
  channel.onmessage({ data: JSON.stringify({ type: "input_audio_buffer.speech_stopped" }) });
  channel.onmessage({ data: JSON.stringify({ type: "conversation.item.input_audio_transcription.completed", transcript: "mock transcript" }) });
  channel.onmessage({ data: JSON.stringify({ type: "response.created" }) });
  channel.onmessage({ data: JSON.stringify({ type: "response.output_item.done", item: { type: "function_call", call_id: "measured-call", name: "oz_create_task_candidate", arguments: "{}" } }) });
  channel.onmessage({ data: JSON.stringify({ type: "response.done", response: { status: "completed", output: [] } }) });
  await settle();
  channel.onmessage({ data: JSON.stringify({ type: "response.created" }) });
  channel.onmessage({ data: JSON.stringify({ type: "response.output_audio.delta", delta: "mock audio" }) });
  channel.onmessage({ data: JSON.stringify({ type: "response.output_audio_transcript.delta", delta: "mock assistant transcript" }) });
  channel.onmessage({ data: JSON.stringify({ type: "response.output_audio_transcript.delta", delta: "mock assistant transcript duplicate" }) });
  channel.onmessage({ data: JSON.stringify({ type: "response.done", response: { status: "completed", output: [] } }) });

  const value = app.window.OZ_LATENCY.getSnapshot();
  const names = value.entries.map((entry) => entry.metric);
  for (const expected of [
    "session_started", "client_secret_duration", "microphone_duration", "webrtc_duration",
    "microphone_processing_settings", "remote_audio_track_received", "audio_element_playing",
    "connection_speech_started", "connection_speech_stopped",
    "speech_started", "speech_stopped", "voice_turn_duration", "transcript_completed", "response_created",
    "network_duration", "context_refresh_duration", "tool_duration", "tool_result_returned",
    "tool_done_to_response_created", "first_audio_delta", "tool_done_to_first_audio",
    "first_output_audio_transcript_delta", "speech_stop_to_first_output_audio_transcript",
    "response_created_to_first_output_audio_transcript", "tool_done_to_first_output_audio_transcript", "response_total",
  ]) assert.ok(names.includes(expected), `missing ${expected}`);
  assert.ok(value.entries.filter((entry) => entry.scope === "tool").every((entry) => entry.toolCategory === "candidate"));
  assert.equal(JSON.stringify(value).includes("mock transcript"), false);
  assert.equal(JSON.stringify(value).includes("mock audio"), false);
  assert.equal(JSON.stringify(value).includes("mock assistant transcript"), false);
  assert.equal(JSON.stringify(value).includes("measured-call"), false);
  for (const forbidden of ["must-not-enter-metrics", "deviceId", "groupId", "label"]) {
    assert.equal(JSON.stringify(value).includes(forbidden), false);
  }
});

test("mock VAD overlap and cancelled events are counted once per connection", async () => {
  const app = runtime({ realMetrics: true });
  app.body.dataset.ozMode = "live";
  app.window.OZ_LATENCY.enableDiagnostics();
  await app.window.OZ_LIVE.connect();
  const channel = app.dataChannel;

  channel.onmessage({ data: JSON.stringify({ type: "input_audio_buffer.speech_started" }) });
  channel.onmessage({ data: JSON.stringify({ type: "input_audio_buffer.speech_stopped" }) });
  channel.onmessage({ data: JSON.stringify({ type: "response.created" }) });
  channel.onmessage({ data: JSON.stringify({ type: "input_audio_buffer.speech_started" }) });
  channel.onmessage({ data: JSON.stringify({ type: "response.cancelled" }) });
  channel.onmessage({ data: JSON.stringify({ type: "response.cancelled" }) });
  channel.onmessage({ data: JSON.stringify({ type: "input_audio_buffer.speech_stopped" }) });
  channel.onmessage({ data: JSON.stringify({ type: "response.created" }) });
  channel.onmessage({ data: JSON.stringify({ type: "response.done", response: { status: "completed", output: [] } }) });
  channel.onmessage({ data: JSON.stringify({ type: "input_audio_buffer.speech_started" }) });

  const value = app.window.OZ_LATENCY.getSnapshot();
  const starts = value.entries.filter((entry) => entry.metric === "speech_started");
  assert.deepEqual([...starts.map((entry) => entry.assistantResponsePhase)], ["before_response", "in_progress", "after_response"]);
  assert.equal(value.entries.filter((entry) => entry.metric === "connection_speech_started").length, 3);
  assert.equal(value.entries.filter((entry) => entry.metric === "connection_speech_stopped").length, 2);
  assert.equal(value.entries.filter((entry) => entry.metric === "connection_cancelled").length, 1);
  const cancellation = value.entries.find((entry) => entry.metric === "response_cancelled");
  assert.equal(cancellation.assistantResponseActive, true);
});

function functionOutput(channel, callId) {
  const event = channel.sent.find((entry) => entry.type === "conversation.item.create" && entry.item?.type === "function_call_output" && entry.item.call_id === callId);
  return event ? JSON.parse(event.item.output) : null;
}

test("voice bulk review first turn prepares exact targets but performs no mutation", async () => {
  const app = runtime();
  app.body.dataset.ozMode = "live";
  await app.window.OZ_LIVE.connect();
  const channel = app.dataChannel;

  channel.onmessage({data:JSON.stringify({type:"input_audio_buffer.speech_started"})});
  channel.onmessage({data:JSON.stringify({type:"conversation.item.input_audio_transcription.completed", transcript:"確認待ちのプロジェクトをすべて承認して"})});
  channel.onmessage({data:JSON.stringify({type:"response.output_item.done", item:{type:"function_call", call_id:"prepare-one", name:"oz_prepare_project_review_batch", arguments:JSON.stringify({decision:"APPROVED"})}})});
  await settle();

  const prepared = functionOutput(channel, "prepare-one");
  assert.equal(app.batchPreparations, 1);
  assert.equal(app.batchExecutions, 0);
  assert.equal(prepared.data.count, 2);
  assert.deepEqual([...prepared.data.names], ["Project One", "Project Two"]);
  assert.equal(prepared.data.formalProjectsWillBeCreated, true);
  assert.equal(prepared.data.initialTaskCandidatesAutoCreated, false);
  assert.equal(app.window.OZ_LIVE.getState().hasPendingVoiceBatch, true);

  channel.onmessage({data:JSON.stringify({type:"response.output_item.done", item:{type:"function_call", call_id:"confirm-too-early", name:"oz_confirm_project_review_batch", arguments:JSON.stringify({confirmationId:prepared.data.confirmationId})}})});
  await settle();
  assert.equal(app.batchExecutions, 0);
  assert.equal(functionOutput(channel, "confirm-too-early").code, "EXPLICIT_SECOND_CONFIRMATION_REQUIRED");
});

test("voice bulk review executes once only after explicit next-turn confirmation, despite duplicate transcript events", async () => {
  const app = runtime();
  app.body.dataset.ozMode = "live";
  await app.window.OZ_LIVE.connect();
  const channel = app.dataChannel;

  channel.onmessage({data:JSON.stringify({type:"input_audio_buffer.speech_started"})});
  channel.onmessage({data:JSON.stringify({type:"conversation.item.input_audio_transcription.completed", transcript:"17件を承認して"})});
  channel.onmessage({data:JSON.stringify({type:"response.output_item.done", item:{type:"function_call", call_id:"prepare-two", name:"oz_prepare_project_review_batch", arguments:JSON.stringify({decision:"APPROVED"})}})});
  await settle();
  const confirmationId = functionOutput(channel, "prepare-two").data.confirmationId;

  channel.onmessage({data:JSON.stringify({type:"input_audio_buffer.speech_started"})});
  channel.onmessage({data:JSON.stringify({type:"conversation.item.input_audio_transcription.completed", transcript:"はい、承認して"})});
  channel.onmessage({data:JSON.stringify({type:"conversation.item.input_audio_transcription.completed", transcript:"はい、承認して"})});
  const confirmArguments = JSON.stringify({confirmationId});
  channel.onmessage({data:JSON.stringify({type:"response.output_item.done", item:{type:"function_call", call_id:"confirm-primary", name:"oz_confirm_project_review_batch", arguments:confirmArguments}})});
  channel.onmessage({data:JSON.stringify({type:"response.output_item.done", item:{type:"function_call", call_id:"confirm-duplicate", name:"oz_confirm_project_review_batch", arguments:confirmArguments}})});
  await settle();

  assert.equal(app.batchExecutions, 1);
  assert.equal(app.lastToolOptions.sourceType, "VOICE");
  assert.equal(functionOutput(channel, "confirm-primary").code, "PROJECT_REVIEW_BATCH_RESOLVED");
  assert.equal(functionOutput(channel, "confirm-duplicate").code, "PROJECT_REVIEW_BATCH_RESOLVED");
});

test("voice bulk review reports server-verified all-failure as failure", async () => {
  const app = runtime({batchResult:{
    total:2,
    successCount:0,
    failureCount:2,
    results:[
      {name:"Project One", ok:false, code:"CONTEXT_VERIFICATION_FAILED"},
      {name:"Project Two", ok:false, code:"CONTEXT_VERIFICATION_FAILED"},
    ],
  }});
  app.body.dataset.ozMode = "live";
  await app.window.OZ_LIVE.connect();
  const channel = app.dataChannel;
  channel.onmessage({data:JSON.stringify({type:"input_audio_buffer.speech_started"})});
  channel.onmessage({data:JSON.stringify({type:"conversation.item.input_audio_transcription.completed", transcript:"すべて承認して"})});
  channel.onmessage({data:JSON.stringify({type:"response.output_item.done", item:{type:"function_call", call_id:"prepare-failure", name:"oz_prepare_project_review_batch", arguments:JSON.stringify({decision:"APPROVED"})}})});
  await settle();
  const confirmationId = functionOutput(channel, "prepare-failure").data.confirmationId;
  channel.onmessage({data:JSON.stringify({type:"input_audio_buffer.speech_started"})});
  channel.onmessage({data:JSON.stringify({type:"conversation.item.input_audio_transcription.completed", transcript:"はい、承認して"})});
  channel.onmessage({data:JSON.stringify({type:"response.output_item.done", item:{type:"function_call", call_id:"confirm-failure", name:"oz_confirm_project_review_batch", arguments:JSON.stringify({confirmationId})}})});
  await settle();

  const output = functionOutput(channel, "confirm-failure");
  assert.equal(app.batchExecutions, 1);
  assert.equal(output.ok, false);
  assert.equal(output.code, "PROJECT_REVIEW_BATCH_FAILED");
  assert.equal(output.data.successCount, 0);
  assert.equal(output.data.failureCount, 2);
});

test("ambiguous next-turn voice response cannot resolve a prepared batch", async () => {
  const app = runtime();
  app.body.dataset.ozMode = "live";
  await app.window.OZ_LIVE.connect();
  const channel = app.dataChannel;
  channel.onmessage({data:JSON.stringify({type:"input_audio_buffer.speech_started"})});
  channel.onmessage({data:JSON.stringify({type:"conversation.item.input_audio_transcription.completed", transcript:"全部承認して"})});
  channel.onmessage({data:JSON.stringify({type:"response.output_item.done", item:{type:"function_call", call_id:"prepare-ambiguous", name:"oz_prepare_project_review_batch", arguments:JSON.stringify({decision:"APPROVED"})}})});
  await settle();
  const confirmationId = functionOutput(channel, "prepare-ambiguous").data.confirmationId;
  channel.onmessage({data:JSON.stringify({type:"input_audio_buffer.speech_started"})});
  channel.onmessage({data:JSON.stringify({type:"conversation.item.input_audio_transcription.completed", transcript:"それはどうなる？"})});
  channel.onmessage({data:JSON.stringify({type:"response.output_item.done", item:{type:"function_call", call_id:"confirm-ambiguous", name:"oz_confirm_project_review_batch", arguments:JSON.stringify({confirmationId})}})});
  await settle();
  assert.equal(app.batchExecutions, 0);
  assert.equal(functionOutput(channel, "confirm-ambiguous").code, "EXPLICIT_SECOND_CONFIRMATION_REQUIRED");
});
