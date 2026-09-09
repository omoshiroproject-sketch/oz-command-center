export type OzToolName =
  | "oz_get_context"
  | "oz_get_daily_brief"
  | "oz_list_projects"
  | "oz_list_tasks"
  | "oz_get_task"
  | "oz_list_reviews"
  | "oz_create_project_candidate"
  | "oz_create_task_candidate"
  | "oz_propose_task_update"
  | "oz_propose_task_status_change"
  | "oz_resolve_review"
  | "oz_propose_external_action";

export type OzToolDefinition = {
  name: OzToolName;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    openWorldHint: boolean;
    idempotentHint: boolean;
  };
  approval: "automatic" | "explicit";
};

const empty = { type: "object", properties: {}, additionalProperties: false };
const result = {
  type: "object",
  properties: {
    ok: { type: "boolean" },
    code: { type: "string" },
    data: { type: "object" },
  },
  required: ["ok", "code", "data"],
  additionalProperties: false,
};
const uuid = { type: "string", format: "uuid" };
const taskStatus = { type: "string", enum: ["UNSTARTED", "IN_PROGRESS", "WAITING", "ON_HOLD", "COMPLETED"] };
const projectStatus = { type: "string", enum: ["IDEA", "PLANNED", "ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"] };
const mutationAnnotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true };
const readAnnotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true };

export const OZ_TOOL_DEFINITIONS: readonly OzToolDefinition[] = [
  { name: "oz_get_context", title: "Get OZ context", description: "Read the authenticated owner's formal projects, tasks, reviews, safe audit summaries, and connector states.", inputSchema: empty, outputSchema: result, annotations: readAnnotations, approval: "automatic" },
  { name: "oz_get_daily_brief", title: "Get daily brief", description: "Rank today's formal work with reasons, overdue and blocked items, quick wins, pending reviews, and unavailable sources.", inputSchema: empty, outputSchema: result, annotations: readAnnotations, approval: "automatic" },
  { name: "oz_list_projects", title: "List projects", description: "List formal projects owned by the authenticated owner.", inputSchema: { type: "object", properties: { status: projectStatus }, additionalProperties: false }, outputSchema: result, annotations: readAnnotations, approval: "automatic" },
  { name: "oz_list_tasks", title: "List tasks", description: "List formal tasks owned by the authenticated owner using optional project, status, view, and importance filters.", inputSchema: { type: "object", properties: { projectId: uuid, status: taskStatus, view: { type: "string", enum: ["TODAY", "OVERDUE", "WEEK", "ALL", "COMPLETED"] }, importance: { type: "integer", minimum: 1, maximum: 5 } }, additionalProperties: false }, outputSchema: result, annotations: readAnnotations, approval: "automatic" },
  { name: "oz_get_task", title: "Get task", description: "Read one formal task and its safe dependency and source metadata.", inputSchema: { type: "object", properties: { taskId: uuid }, required: ["taskId"], additionalProperties: false }, outputSchema: result, annotations: readAnnotations, approval: "automatic" },
  { name: "oz_list_reviews", title: "List reviews", description: "List confirmation candidates for the authenticated owner.", inputSchema: { type: "object", properties: { status: { type: "string", enum: ["PENDING", "APPROVED", "REJECTED", "NEEDS_EDIT"] } }, additionalProperties: false }, outputSchema: result, annotations: readAnnotations, approval: "automatic" },
  { name: "oz_create_project_candidate", title: "Create project candidate", description: "Create a confirmation candidate only. It does not create a formal project until the owner approves the review.", inputSchema: { type: "object", properties: { name: { type: "string", minLength: 1, maxLength: 180 }, description: { type: ["string", "null"], maxLength: 10000 }, status: projectStatus, importance: { type: "integer", minimum: 1, maximum: 5 }, targetDate: { type: ["string", "null"], format: "date" } }, required: ["name"], additionalProperties: false }, outputSchema: result, annotations: mutationAnnotations, approval: "automatic" },
  { name: "oz_create_task_candidate", title: "Create task candidate", description: "Create a confirmation candidate only. It never inserts a formal task directly.", inputSchema: { type: "object", properties: { title: { type: "string", minLength: 1, maxLength: 180 }, description: { type: ["string", "null"], maxLength: 10000 }, projectId: { anyOf: [uuid, { type: "null" }] }, projectCandidate: { type: ["string", "null"], maxLength: 120 }, dueAt: { type: ["string", "null"], format: "date-time" }, estimatedMinutes: { type: ["integer", "null"], minimum: 0 }, actualMinutes: { type: ["integer", "null"], minimum: 0 }, importance: { type: "integer", minimum: 1, maximum: 5 }, assigneeLabel: { type: ["string", "null"], maxLength: 180 }, delegationState: { type: "string", enum: ["SELF", "CANDIDATE", "DELEGATED"] }, delegateLabel: { type: ["string", "null"], maxLength: 180 }, executionEnvironment: { type: "string", enum: ["ANY", "MOBILE", "PC", "TRAVEL_OK", "CALL", "IN_PERSON"] }, travelAllowed: { type: "boolean" }, blockReason: { type: ["string", "null"], maxLength: 2000 }, timeLane: { type: "string", enum: ["DUE", "TODAY_IF_POSSIBLE", "SOMEDAY"] }, source: { type: "string", enum: ["USER_CONFIRMED_INITIAL_CANDIDATE"] } }, required: ["title"], additionalProperties: false }, outputSchema: result, annotations: mutationAnnotations, approval: "automatic" },
  { name: "oz_propose_task_update", title: "Propose task update", description: "Create a review for edits to a formal task. The task is not changed until explicit owner approval.", inputSchema: { type: "object", properties: { taskId: uuid, patch: { type: "object", minProperties: 1, properties: { title: { type: "string", minLength: 1, maxLength: 180 }, description: { type: ["string", "null"] }, projectId: { anyOf: [uuid, { type: "null" }] }, timeLane: { type: "string", enum: ["DUE", "TODAY_IF_POSSIBLE", "SOMEDAY"] }, importance: { type: "integer", minimum: 1, maximum: 5 }, dueAt: { type: ["string", "null"], format: "date-time" }, estimatedMinutes: { type: ["integer", "null"], minimum: 0 }, actualMinutes: { type: ["integer", "null"], minimum: 0 }, assigneeLabel: { type: ["string", "null"], maxLength: 180 }, delegationState: { type: "string", enum: ["SELF", "CANDIDATE", "DELEGATED"] }, delegateLabel: { type: ["string", "null"], maxLength: 180 }, executionEnvironment: { type: "string", enum: ["ANY", "MOBILE", "PC", "TRAVEL_OK", "CALL", "IN_PERSON"] }, blockReason: { type: ["string", "null"], maxLength: 2000 }, travelAllowed: { type: "boolean" } }, additionalProperties: false } }, required: ["taskId", "patch"], additionalProperties: false }, outputSchema: result, annotations: mutationAnnotations, approval: "automatic" },
  { name: "oz_propose_task_status_change", title: "Propose task status change", description: "Create a review for a formal task status transition. The status is not changed until explicit owner approval.", inputSchema: { type: "object", properties: { taskId: uuid, status: taskStatus }, required: ["taskId", "status"], additionalProperties: false }, outputSchema: result, annotations: mutationAnnotations, approval: "automatic" },
  { name: "oz_resolve_review", title: "Resolve review", description: "Approve, reject, or return a review for edits. The client must obtain explicit owner confirmation immediately before calling this tool.", inputSchema: { type: "object", properties: { reviewId: uuid, decision: { type: "string", enum: ["APPROVED", "REJECTED", "NEEDS_EDIT"] }, edits: { type: "object" }, reason: { type: "string", maxLength: 500 } }, required: ["reviewId", "decision"], additionalProperties: false }, outputSchema: result, annotations: mutationAnnotations, approval: "explicit" },
  { name: "oz_propose_external_action", title: "Propose external action", description: "Persist an external action in PROPOSED state only. Phase 1B never executes the external action.", inputSchema: { type: "object", properties: { provider: { type: "string", minLength: 1, maxLength: 80 }, actionType: { type: "string", minLength: 1, maxLength: 120 }, requestPayload: { type: "object" }, targetFingerprint: { type: "string", minLength: 16, maxLength: 128 } }, required: ["provider", "actionType", "requestPayload", "targetFingerprint"], additionalProperties: false }, outputSchema: result, annotations: { ...mutationAnnotations, openWorldHint: true }, approval: "explicit" },
] as const;

export const OZ_TOOL_NAMES = OZ_TOOL_DEFINITIONS.map((tool) => tool.name);

export function getOzToolDefinition(name: string) {
  return OZ_TOOL_DEFINITIONS.find((tool) => tool.name === name);
}
