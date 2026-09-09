import assert from "node:assert/strict";
import test from "node:test";
import { assertExternalActionTransition, assertReviewTransition, assertTaskTransition, nextRealtimeState, REALTIME_STATES } from "../packages/domain/src/state-machines";

test("task transitions require an allowed state edge", () => {
  assert.doesNotThrow(() => assertTaskTransition("UNSTARTED", "IN_PROGRESS"));
  assert.doesNotThrow(() => assertTaskTransition("IN_PROGRESS", "COMPLETED"));
  assert.throws(() => assertTaskTransition("COMPLETED", "UNSTARTED"), /not allowed/);
});

test("review decisions are terminal", () => {
  assert.doesNotThrow(() => assertReviewTransition("PENDING", "APPROVED"));
  assert.throws(() => assertReviewTransition("APPROVED", "PENDING"), /not allowed/);
});

test("external actions cannot skip approval or execution", () => {
  assert.doesNotThrow(() => assertExternalActionTransition("PROPOSED", "APPROVED"));
  assert.throws(() => assertExternalActionTransition("PROPOSED", "SUCCEEDED"), /not allowed/);
});

test("Realtime state machine covers connection, tool, approval, audio, reconnect, expiry, and failure", () => {
  assert.deepEqual(REALTIME_STATES, ["IDLE", "CONNECTING", "LISTENING", "THINKING", "TOOL_CALLING", "AWAITING_APPROVAL", "SPEAKING", "RECONNECTING", "ERROR"]);
  assert.equal(nextRealtimeState("IDLE", "CONNECT"), "CONNECTING");
  assert.equal(nextRealtimeState("CONNECTING", "CONNECTED"), "LISTENING");
  assert.equal(nextRealtimeState("LISTENING", "SPEECH_STOPPED"), "THINKING");
  assert.equal(nextRealtimeState("THINKING", "TOOL_STARTED"), "TOOL_CALLING");
  assert.equal(nextRealtimeState("TOOL_CALLING", "APPROVAL_REQUIRED"), "AWAITING_APPROVAL");
  assert.equal(nextRealtimeState("THINKING", "AUDIO_STARTED"), "SPEAKING");
  assert.equal(nextRealtimeState("SPEAKING", "TOKEN_EXPIRED"), "RECONNECTING");
  assert.equal(nextRealtimeState("RECONNECTING", "RETRY"), "CONNECTING");
  assert.equal(nextRealtimeState("TOOL_CALLING", "FAIL"), "ERROR");
});
