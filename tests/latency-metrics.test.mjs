import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(path.join(root, "public/oz-latency-metrics.js"), "utf8");

function runtime({ hostname = "127.0.0.1", clockThrows = false } = {}) {
  let now = 0;
  const window = { location: { hostname } };
  const performance = {
    now() {
      if (clockThrows) throw new Error("isolated clock failure");
      return now;
    },
  };
  vm.runInContext(source, vm.createContext({ window, performance }));
  return {
    metrics: window.OZ_LATENCY,
    advance(milliseconds) { now += milliseconds; },
  };
}

function snapshot(app) {
  assert.equal(app.metrics.enableDiagnostics(), true);
  const value = app.metrics.getSnapshot();
  assert.ok(value);
  return value;
}

function entriesFor(value, metric) {
  return value.entries.filter((entry) => entry.metric === metric);
}

test("diagnostics are local, explicit, read-only, and silent with no persistence or transport", () => {
  const app = runtime();
  const connection = app.metrics.connectionStarted("client_secret");
  app.advance(12);
  app.metrics.connectionFinished(connection, "success");
  assert.equal(app.metrics.getSnapshot(), null);

  const value = snapshot(app);
  assert.equal(value.schemaVersion, 2);
  assert.equal(value.audioStartProxy, "output_audio_transcript_delta");
  assert.equal(value.audioElementPlayingScope, "connection");
  assert.equal(value.physicalSpeakerPlaybackMeasured, false);
  assert.equal(value.entryCount, 2);
  assert.equal(Object.isFrozen(value), true);
  assert.equal(Object.isFrozen(value.entries), true);
  assert.equal(Object.isFrozen(value.entries[0]), true);
  assert.throws(() => value.entries.push({}));
  assert.throws(() => { value.entries[0].metric = "changed"; });
  assert.equal(app.metrics.getSnapshot().entries[0].metric, "client_secret_started");

  const remote = runtime({ hostname: "example.com" });
  assert.equal(remote.metrics.enableDiagnostics(), false);
  assert.equal(remote.metrics.getSnapshot(), null);
  assert.doesNotMatch(source, /\b(?:localStorage|sessionStorage|indexedDB|document\.cookie|sendBeacon|XMLHttpRequest)\b/);
  assert.doesNotMatch(source, /\bfetch\s*\(|console\.|Date\.now\(|new Date\s*\(/);
});

test("normal voice turn records monotonic milestones and derived latency without content", () => {
  const app = runtime();
  const turn = app.metrics.speechStarted();
  app.advance(100);
  assert.equal(app.metrics.speechStopped(turn), true);
  app.advance(50);
  assert.equal(app.metrics.transcriptCompleted(turn, "本文は無視される"), true);
  app.advance(20);
  app.metrics.responseCreated(turn);
  app.advance(30);
  app.metrics.firstAudioDelta("音声データは無視される");
  app.advance(200);
  app.metrics.responseFinished("success", { body: "無視される" });

  const value = snapshot(app);
  assert.equal(entriesFor(value, "speech_stop_to_transcript")[0].durationMs, 50);
  assert.equal(entriesFor(value, "speech_stop_to_response_created")[0].durationMs, 70);
  assert.equal(entriesFor(value, "speech_stop_to_first_audio")[0].durationMs, 100);
  assert.equal(entriesFor(value, "voice_turn_duration")[0].durationMs, 100);
  assert.equal(entriesFor(value, "response_total")[0].durationMs, 230);
  assert.equal(entriesFor(value, "response_total")[0].outcome, "success");
});

test("late or missing transcript and missing audio remain valid partial measurements", () => {
  const late = runtime();
  const turn = late.metrics.speechStarted();
  late.advance(20);
  late.metrics.speechStopped(turn);
  late.advance(10);
  late.metrics.responseCreated(turn);
  late.advance(40);
  late.metrics.responseFinished("success");
  late.advance(30);
  late.metrics.transcriptCompleted(turn);
  const lateValue = snapshot(late);
  assert.equal(entriesFor(lateValue, "speech_stop_to_transcript")[0].durationMs, 80);
  assert.equal(entriesFor(lateValue, "speech_stop_to_first_audio").length, 0);

  const missing = runtime();
  const missingTurn = missing.metrics.speechStarted();
  missing.advance(5);
  missing.metrics.speechStopped(missingTurn);
  missing.advance(15);
  missing.metrics.responseCreated(missingTurn);
  missing.advance(10);
  missing.metrics.responseFinished("success");
  const missingValue = snapshot(missing);
  assert.equal(entriesFor(missingValue, "transcript_completed").length, 0);
  assert.equal(entriesFor(missingValue, "first_audio_delta").length, 0);
  assert.equal(entriesFor(missingValue, "first_output_audio_transcript_delta").length, 0);
  assert.equal(entriesFor(missingValue, "response_total")[0].durationMs, 10);
});

test("WebRTC audio start proxies and connection-level media markers contain timing only", () => {
  const app = runtime();
  const session = app.metrics.connectionStarted("session");
  app.metrics.microphoneProcessingSettings(session, {
    echoCancellation: true,
    noiseSuppression: false,
    autoGainControl: true,
    deviceId: "must-not-be-stored",
    groupId: "must-not-be-stored",
    label: "must-not-be-stored",
  });
  app.advance(2);
  assert.equal(app.metrics.connectionMarker(session, "remote_audio_track_received"), true);
  assert.equal(app.metrics.connectionMarker(session, "remote_audio_track_received"), false);
  app.advance(1);
  assert.equal(app.metrics.connectionMarker(session, "audio_element_playing"), true);

  const turn = app.metrics.speechStarted();
  app.metrics.connectionVoiceEvent(session, "speech_started");
  app.advance(40);
  app.metrics.speechStopped(turn);
  app.metrics.connectionVoiceEvent(session, "speech_stopped");
  app.advance(10);
  app.metrics.responseCreated(turn);
  app.advance(15);
  assert.equal(app.metrics.firstAudioTranscriptDelta("assistant transcript must not be stored"), true);
  assert.equal(app.metrics.firstAudioTranscriptDelta("duplicate must not be stored"), false);
  app.advance(5);
  app.metrics.responseFinished("success");

  const value = snapshot(app);
  assert.equal(entriesFor(value, "remote_audio_track_received")[0].durationMs, 2);
  assert.equal(entriesFor(value, "audio_element_playing")[0].durationMs, 3);
  assert.equal(entriesFor(value, "voice_turn_duration")[0].durationMs, 40);
  assert.equal(entriesFor(value, "speech_stop_to_first_output_audio_transcript")[0].durationMs, 25);
  assert.equal(entriesFor(value, "response_created_to_first_output_audio_transcript")[0].durationMs, 15);
  assert.equal(entriesFor(value, "first_output_audio_transcript_delta").length, 1);
  assert.equal(entriesFor(value, "first_audio_delta").length, 0);

  const settings = entriesFor(value, "microphone_processing_settings")[0];
  assert.deepEqual(
    {echoCancellation:settings.echoCancellation, noiseSuppression:settings.noiseSuppression, autoGainControl:settings.autoGainControl},
    {echoCancellation:true, noiseSuppression:false, autoGainControl:true},
  );
  const serialized = JSON.stringify(value);
  for (const forbidden of ["assistant transcript", "duplicate", "must-not-be-stored", "deviceId", "groupId", "label"]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("output transcript proxy supports tool latency and ignores missing, duplicate, and out-of-order deltas", () => {
  const app = runtime();
  const turn = app.metrics.speechStarted();
  app.advance(5);
  app.metrics.speechStopped(turn);
  app.advance(5);
  app.metrics.responseCreated(turn);
  app.advance(5);
  app.metrics.responseFinished("success");

  const tool = app.metrics.toolStarted("read");
  app.advance(10);
  app.metrics.toolFinished(tool, "success");
  app.metrics.toolResultReturned(tool);
  app.advance(7);
  app.metrics.responseCreated(turn);
  app.advance(11);
  assert.equal(app.metrics.firstAudioTranscriptDelta({delta:"not stored"}), true);
  assert.equal(app.metrics.firstAudioTranscriptDelta({delta:"not stored twice"}), false);
  app.metrics.responseFinished("success");

  const value = snapshot(app);
  assert.equal(entriesFor(value, "tool_done_to_first_output_audio_transcript")[0].durationMs, 18);
  assert.equal(entriesFor(value, "first_output_audio_transcript_delta").length, 1);

  const outOfOrder = runtime();
  const outOfOrderTurn = outOfOrder.metrics.speechStarted();
  outOfOrder.advance(4);
  outOfOrder.metrics.speechStopped(outOfOrderTurn);
  outOfOrder.advance(3);
  assert.equal(outOfOrder.metrics.firstAudioTranscriptDelta(), true);
  outOfOrder.advance(5);
  outOfOrder.metrics.responseCreated(outOfOrderTurn);
  assert.equal(outOfOrder.metrics.firstAudioTranscriptDelta(), false);
  const outOfOrderValue = snapshot(outOfOrder);
  assert.equal(entriesFor(outOfOrderValue, "response_created_to_first_output_audio_transcript").length, 0);
  assert.ok(outOfOrderValue.entries.every((entry) => entry.durationMs === undefined || entry.durationMs >= 0));
});

test("tool and no-tool responses record only fixed safe categories and outcomes", () => {
  const app = runtime();
  const turn = app.metrics.speechStarted();
  app.advance(5);
  app.metrics.speechStopped(turn);
  app.advance(5);
  app.metrics.responseCreated(turn);
  app.advance(10);
  app.metrics.responseFinished("success");

  const tool = app.metrics.toolStarted("candidate", { title: "ignored" });
  app.advance(4);
  app.metrics.toolNetworkStarted(tool);
  app.advance(16);
  app.metrics.toolNetworkFinished(tool, "success");
  app.advance(2);
  app.metrics.contextRefreshStarted(tool);
  app.advance(8);
  app.metrics.contextRefreshFinished(tool, "success");
  app.advance(5);
  app.metrics.toolFinished(tool, "success");
  app.advance(1);
  app.metrics.toolResultReturned(tool, { responseBody: "ignored" });
  app.advance(9);
  app.metrics.responseCreated(turn);
  app.advance(11);
  app.metrics.firstAudioDelta();
  app.advance(20);
  app.metrics.responseFinished("success");

  for (const outcome of ["failed", "cancelled", "timeout"]) {
    const sequence = app.metrics.toolStarted("not-an-allowed-category");
    app.advance(1);
    app.metrics.toolFinished(sequence, outcome);
  }

  const value = snapshot(app);
  assert.equal(entriesFor(value, "network_duration")[0].durationMs, 16);
  assert.equal(entriesFor(value, "context_refresh_duration")[0].durationMs, 8);
  assert.equal(entriesFor(value, "tool_done_to_response_created")[0].durationMs, 10);
  assert.equal(entriesFor(value, "tool_done_to_first_audio")[0].durationMs, 21);
  assert.deepEqual([...entriesFor(value, "tool_duration").map((entry) => entry.outcome)], ["success", "failed", "cancelled", "timeout"]);
  assert.ok(value.entries.filter((entry) => entry.scope === "tool").every((entry) => ["candidate", "other"].includes(entry.toolCategory)));
});

test("response cancellation, interruption, reconnect, failure, and timeout are fixed outcomes", () => {
  const app = runtime();
  const firstTurn = app.metrics.speechStarted();
  app.advance(3);
  app.metrics.speechStopped(firstTurn);
  app.advance(2);
  app.metrics.responseCreated(firstTurn);
  app.advance(4);
  app.metrics.speechStarted();
  app.advance(1);
  app.metrics.responseFinished("cancelled");
  app.metrics.connectionEvent("reconnect_scheduled");
  app.metrics.connectionEvent("connection_timeout");

  for (const outcome of ["failed", "timeout"]) {
    const connection = app.metrics.connectionStarted("webrtc");
    app.advance(7);
    app.metrics.connectionFinished(connection, outcome);
  }

  const value = snapshot(app);
  assert.equal(entriesFor(value, "speech_started").length, 2);
  assert.equal(entriesFor(value, "response_cancelled").length, 1);
  assert.equal(entriesFor(value, "response_total")[0].outcome, "cancelled");
  assert.equal(entriesFor(value, "reconnect_scheduled").length, 1);
  assert.equal(entriesFor(value, "connection_timeout")[0].outcome, "timeout");
  assert.deepEqual([...entriesFor(value, "webrtc_duration").map((entry) => entry.outcome)], ["failed", "timeout"]);
});

test("VAD diagnostics distinguish response overlap, response-ended starts, short turns, and cancellation state", () => {
  const app = runtime();
  const session = app.metrics.connectionStarted("session");
  const firstTurn = app.metrics.speechStarted();
  app.metrics.connectionVoiceEvent(session, "speech_started");
  app.advance(25);
  app.metrics.speechStopped(firstTurn);
  app.metrics.connectionVoiceEvent(session, "speech_stopped");
  app.advance(5);
  app.metrics.responseCreated(firstTurn);

  app.advance(10);
  const interruptingTurn = app.metrics.speechStarted();
  app.metrics.connectionVoiceEvent(session, "speech_started");
  app.advance(8);
  app.metrics.speechStopped(interruptingTurn);
  app.metrics.connectionVoiceEvent(session, "speech_stopped");
  assert.equal(app.metrics.responseFinished("cancelled"), true);
  app.metrics.connectionVoiceEvent(session, "cancelled");
  assert.equal(app.metrics.responseFinished("cancelled"), false);

  app.advance(2);
  app.metrics.responseCreated(interruptingTurn);
  app.advance(3);
  app.metrics.responseFinished("success");
  const afterResponseTurn = app.metrics.speechStarted();
  app.metrics.connectionVoiceEvent(session, "speech_started");
  app.advance(4);
  app.metrics.speechStopped(afterResponseTurn);
  app.metrics.connectionVoiceEvent(session, "speech_stopped");
  assert.equal(app.metrics.responseFinished("cancelled"), true);
  app.metrics.connectionVoiceEvent(session, "cancelled");

  const value = snapshot(app);
  const starts = entriesFor(value, "speech_started");
  assert.deepEqual([...starts.map((entry) => entry.assistantResponsePhase)], ["before_response", "in_progress", "after_response"]);
  assert.deepEqual([...starts.map((entry) => entry.assistantResponseActive)], [false, true, false]);
  assert.deepEqual([...entriesFor(value, "voice_turn_duration").map((entry) => entry.durationMs)], [25, 8, 4]);
  assert.deepEqual([...entriesFor(value, "response_cancelled").map((entry) => entry.assistantResponseActive)], [true, false]);

  const connectionStarts = entriesFor(value, "connection_speech_started");
  const connectionStops = entriesFor(value, "connection_speech_stopped");
  const connectionCancelled = entriesFor(value, "connection_cancelled");
  assert.equal(connectionStarts.length, 3);
  assert.equal(connectionStops.length, 3);
  assert.equal(connectionCancelled.length, 2);
  assert.ok([...connectionStarts, ...connectionStops, ...connectionCancelled].every((entry) => entry.correlationSequence === session));
});

test("reconnect starts an independent connection correlation and cancellation counter", () => {
  const app = runtime();
  const firstSession = app.metrics.connectionStarted("session");
  const firstTurn = app.metrics.speechStarted();
  app.metrics.connectionVoiceEvent(firstSession, "speech_started");
  app.metrics.speechStopped(firstTurn);
  app.metrics.responseCreated(firstTurn);
  app.metrics.responseFinished("cancelled");
  app.metrics.connectionVoiceEvent(firstSession, "cancelled");
  app.metrics.connectionFinished(firstSession, "failed");

  const secondSession = app.metrics.connectionStarted("session");
  const secondTurn = app.metrics.speechStarted();
  app.metrics.connectionVoiceEvent(secondSession, "speech_started");
  app.metrics.speechStopped(secondTurn);
  assert.equal(app.metrics.responseFinished("cancelled"), true);
  app.metrics.connectionVoiceEvent(secondSession, "cancelled");

  const value = snapshot(app);
  const cancellations = entriesFor(value, "connection_cancelled");
  assert.equal(cancellations.length, 2);
  assert.deepEqual([...cancellations.map((entry) => entry.correlationSequence)], [firstSession, secondSession]);
  assert.notEqual(firstSession, secondSession);
});

test("duplicates and out-of-order events never produce duplicate or negative durations", () => {
  const duplicate = runtime();
  const turn = duplicate.metrics.speechStarted();
  duplicate.advance(10);
  assert.equal(duplicate.metrics.speechStopped(turn), true);
  assert.equal(duplicate.metrics.speechStopped(turn), false);
  duplicate.advance(5);
  assert.equal(duplicate.metrics.transcriptCompleted(turn), true);
  assert.equal(duplicate.metrics.transcriptCompleted(turn), false);
  duplicate.advance(5);
  const response = duplicate.metrics.responseCreated(turn);
  assert.equal(duplicate.metrics.responseCreated(turn), response);
  duplicate.advance(5);
  assert.equal(duplicate.metrics.firstAudioDelta(), true);
  assert.equal(duplicate.metrics.firstAudioDelta(), false);
  duplicate.advance(5);
  assert.equal(duplicate.metrics.responseFinished("success"), true);
  assert.equal(duplicate.metrics.responseFinished("success"), false);
  const duplicateValue = snapshot(duplicate);
  for (const metric of ["speech_stopped", "transcript_completed", "response_created", "first_audio_delta", "response_done", "response_total"]) {
    assert.equal(entriesFor(duplicateValue, metric).length, 1);
  }

  const outOfOrder = runtime();
  const outOfOrderTurn = outOfOrder.metrics.speechStarted();
  outOfOrder.advance(5);
  outOfOrder.metrics.transcriptCompleted(outOfOrderTurn);
  outOfOrder.advance(5);
  outOfOrder.metrics.speechStopped(outOfOrderTurn);
  const outOfOrderValue = snapshot(outOfOrder);
  assert.equal(entriesFor(outOfOrderValue, "speech_stop_to_transcript").length, 0);
  assert.ok(outOfOrderValue.entries.every((entry) => entry.durationMs === undefined || entry.durationMs >= 0));
});

test("buffer is bounded, reset is explicit, and instrumentation failures never throw", () => {
  const app = runtime();
  app.metrics.enableDiagnostics();
  for (let index = 0; index < 300; index += 1) app.metrics.connectionEvent("reconnect_scheduled");
  const bounded = app.metrics.getSnapshot();
  assert.equal(bounded.capacity, 256);
  assert.equal(bounded.entryCount, 256);
  assert.equal(bounded.droppedEntries, 44);
  assert.equal(app.metrics.reset(), true);
  const reset = app.metrics.getSnapshot();
  assert.equal(reset.entryCount, 0);
  assert.equal(reset.droppedEntries, 0);

  const broken = runtime({ clockThrows: true });
  assert.doesNotThrow(() => broken.metrics.connectionStarted("webrtc"));
  assert.doesNotThrow(() => broken.metrics.speechStarted());
  assert.doesNotThrow(() => broken.metrics.toolStarted("read"));
  assert.equal(broken.metrics.connectionStarted("webrtc"), null);
});

test("snapshot schema cannot contain bodies, identities, credentials, raw IDs, or arbitrary fields", () => {
  const app = runtime();
  const session = app.metrics.connectionStarted("session");
  app.metrics.microphoneProcessingSettings(session, {
    echoCancellation:true, noiseSuppression:true, autoGainControl:true,
    deviceId:"never stored", groupId:"never stored", label:"never stored",
  });
  const tool = app.metrics.toolStarted("read", {
    transcript: "never stored",
    authorization: "never stored",
    email: "never stored",
    responseId: "never stored",
  });
  app.advance(1);
  app.metrics.toolFinished(tool, "success", "secret-value-never-stored");
  app.metrics.toolResultReturned(tool, { body: "never stored" });
  const value = snapshot(app);

  assert.deepEqual([...Object.keys(value).sort()], [
    "audioElementPlayingScope", "audioStartProxy", "capacity", "droppedEntries", "entries", "entryCount",
    "physicalSpeakerPlaybackMeasured", "schemaVersion",
  ]);
  const allowedEntryKeys = new Set([
    "sequence", "scope", "correlationSequence", "metric", "outcome", "durationMs", "toolCategory",
    "assistantResponseActive", "assistantResponsePhase", "echoCancellation", "noiseSuppression", "autoGainControl",
  ]);
  for (const entry of value.entries) assert.ok(Object.keys(entry).every((key) => allowedEntryKeys.has(key)));
  const serialized = JSON.stringify(value);
  for (const forbidden of ["never stored", "secret-value-never-stored", "authorization", "email", "responseId", "call_id", "userId", "projectName", "taskName", "deviceId", "groupId", "label"]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});
