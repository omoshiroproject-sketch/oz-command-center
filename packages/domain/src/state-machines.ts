import type { ExternalActionStatus, ReviewStatus, TaskStatus } from "../../contracts/src/index";

const taskTransitions: Record<TaskStatus, readonly TaskStatus[]> = {
  UNSTARTED: ["IN_PROGRESS", "WAITING", "ON_HOLD", "COMPLETED"],
  IN_PROGRESS: ["WAITING", "ON_HOLD", "COMPLETED"],
  WAITING: ["IN_PROGRESS", "ON_HOLD", "COMPLETED"],
  ON_HOLD: ["UNSTARTED", "IN_PROGRESS", "WAITING", "COMPLETED"],
  COMPLETED: ["IN_PROGRESS"],
};

const reviewTransitions: Record<ReviewStatus, readonly ReviewStatus[]> = {
  PENDING: ["APPROVED", "REJECTED", "NEEDS_EDIT"],
  NEEDS_EDIT: ["PENDING", "APPROVED", "REJECTED"],
  APPROVED: [],
  REJECTED: [],
};

const externalActionTransitions: Record<ExternalActionStatus, readonly ExternalActionStatus[]> = {
  PROPOSED: ["APPROVED", "CANCELLED"],
  APPROVED: ["EXECUTING", "CANCELLED"],
  EXECUTING: ["SUCCEEDED", "FAILED"],
  FAILED: ["APPROVED", "CANCELLED"],
  SUCCEEDED: [],
  CANCELLED: [],
};

function assertTransition<T extends string>(kind: string, from: T, to: T, map: Record<T, readonly T[]>) {
  if (from === to || map[from]?.includes(to)) return;
  throw new Error(`${kind} transition is not allowed: ${from} -> ${to}`);
}

export function assertTaskTransition(from: TaskStatus, to: TaskStatus) {
  assertTransition("task", from, to, taskTransitions);
}

export function assertReviewTransition(from: ReviewStatus, to: ReviewStatus) {
  assertTransition("review", from, to, reviewTransitions);
}

export function assertExternalActionTransition(from: ExternalActionStatus, to: ExternalActionStatus) {
  assertTransition("external action", from, to, externalActionTransitions);
}

export const REALTIME_STATES = [
  "IDLE",
  "CONNECTING",
  "LISTENING",
  "THINKING",
  "TOOL_CALLING",
  "AWAITING_APPROVAL",
  "SPEAKING",
  "RECONNECTING",
  "ERROR",
] as const;

export type RealtimeState = (typeof REALTIME_STATES)[number];
export type RealtimeEvent =
  | "CONNECT"
  | "CONNECTED"
  | "SPEECH_STARTED"
  | "SPEECH_STOPPED"
  | "RESPONSE_STARTED"
  | "TOOL_STARTED"
  | "APPROVAL_REQUIRED"
  | "APPROVAL_RESOLVED"
  | "AUDIO_STARTED"
  | "TURN_COMPLETED"
  | "CONNECTION_LOST"
  | "RETRY"
  | "TOKEN_EXPIRED"
  | "FAIL"
  | "DISCONNECT";

export function nextRealtimeState(state: RealtimeState, event: RealtimeEvent): RealtimeState {
  if (event === "DISCONNECT") return "IDLE";
  if (event === "FAIL") return "ERROR";
  if (event === "TOKEN_EXPIRED" || event === "CONNECTION_LOST") return state === "IDLE" ? "IDLE" : "RECONNECTING";
  if (event === "CONNECT" && ["IDLE", "ERROR"].includes(state)) return "CONNECTING";
  if (event === "RETRY" && ["RECONNECTING", "ERROR"].includes(state)) return "CONNECTING";
  if (event === "CONNECTED") return "LISTENING";
  if (event === "SPEECH_STARTED") return "LISTENING";
  if (["SPEECH_STOPPED", "RESPONSE_STARTED"].includes(event)) return "THINKING";
  if (event === "TOOL_STARTED") return "TOOL_CALLING";
  if (event === "APPROVAL_REQUIRED") return "AWAITING_APPROVAL";
  if (event === "APPROVAL_RESOLVED") return "THINKING";
  if (event === "AUDIO_STARTED") return "SPEAKING";
  if (event === "TURN_COMPLETED") return "LISTENING";
  return state;
}
