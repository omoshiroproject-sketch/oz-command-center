import { z } from "zod";
import {
  emptyToolInputSchema,
  proposeExternalActionSchema,
  toolCreateProjectCandidateSchema,
  toolCreateTaskCandidateSchema,
  toolGetTaskSchema,
  toolListProjectsSchema,
  toolListReviewsSchema,
  toolListTasksSchema,
  toolProposeTaskStatusChangeSchema,
  toolProposeTaskUpdateSchema,
  toolResolveReviewSchema,
} from "../../contracts/src/schemas";
import { buildDailyBrief } from "./daily-brief";
import { getOzToolDefinition, type OzToolName } from "./tool-contracts";

type Row = Record<string, unknown>;

export type OzToolContext = {
  idempotencyKey?: string;
  sourceType?: "QUICK_ADD" | "VOICE" | "CHAT" | "CONNECTOR" | "MANUAL";
};

export type OzContext = {
  projects: Row[];
  tasks: Row[];
  reviews: Row[];
  auditLogs: Row[];
  integrations: Row[];
  externalActions: Row[];
  actionApprovals: Row[];
  legacyCandidates: {
    projectCount: number;
    taskCount: number;
    items: Row[];
  };
};

export interface OzToolRepository {
  getContext(): Promise<OzContext>;
  createReview(input: {
    kind: "TASK_CREATE" | "TASK_STATUS_CHANGE" | "TASK_EDIT" | "PROJECT_CREATE";
    sourceType: "QUICK_ADD" | "VOICE" | "CHAT" | "CONNECTOR" | "MANUAL";
    candidate: Row;
    targetId?: string | null;
    idempotencyKey: string;
  }): Promise<Row>;
  resolveReview(input: {
    reviewId: string;
    decision: "APPROVED" | "REJECTED" | "NEEDS_EDIT";
    edits?: Row;
    reason?: string;
    idempotencyKey: string;
  }): Promise<Row>;
  proposeExternalAction(input: {
    provider: string;
    actionType: string;
    requestPayload: Row;
    targetFingerprint: string;
    idempotencyKey: string;
  }): Promise<Row>;
}

export class OzToolError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) {
    super(message);
    this.name = "OzToolError";
  }
}

const schemaByName: Record<OzToolName, z.ZodType> = {
  oz_get_context: emptyToolInputSchema,
  oz_get_daily_brief: emptyToolInputSchema,
  oz_list_projects: toolListProjectsSchema,
  oz_list_tasks: toolListTasksSchema,
  oz_get_task: toolGetTaskSchema,
  oz_list_reviews: toolListReviewsSchema,
  oz_create_project_candidate: toolCreateProjectCandidateSchema,
  oz_create_task_candidate: toolCreateTaskCandidateSchema,
  oz_propose_task_update: toolProposeTaskUpdateSchema,
  oz_propose_task_status_change: toolProposeTaskStatusChangeSchema,
  oz_resolve_review: toolResolveReviewSchema,
  oz_propose_external_action: proposeExternalActionSchema,
};

function requireIdempotency(context: OzToolContext) {
  const value = context.idempotencyKey?.trim() ?? "";
  if (value.length < 16 || value.length > 200) {
    throw new OzToolError("IDEMPOTENCY_KEY_REQUIRED", "A valid idempotency key is required.");
  }
  return value;
}

function sourceType(context: OzToolContext) {
  return context.sourceType ?? "CHAT";
}

function projectSlug(name: string) {
  const normalized = name.normalize("NFKC").toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
  return normalized || "project-candidate";
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function projectIdentity(row: Row) {
  const slug = stringValue(row.slug).trim();
  if (slug) return slug;
  return projectSlug(stringValue(row.name));
}

function reviewCandidate(review: Row) {
  const candidate = review.candidate_data ?? review.candidateData;
  return candidate && typeof candidate === "object" && !Array.isArray(candidate) ? candidate as Row : {};
}

function normalizedIdentity(value: unknown) {
  return stringValue(value).normalize("NFKC").trim().toLocaleLowerCase("ja-JP").replace(/\s+/g, " ");
}

function taskDay(value: unknown, timezone: string) {
  const date = new Date(stringValue(value));
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function filterTasks(tasks: Row[], input: z.infer<typeof toolListTasksSchema>, now = new Date(), timezone = "Asia/Tokyo") {
  const today = taskDay(now.toISOString(), timezone);
  const weekEnd = new Date(now.getTime() + 7 * 86_400_000);
  const week = taskDay(weekEnd.toISOString(), timezone);
  const filtered = tasks.filter((task) => {
    if (input.projectId && task.projectId !== input.projectId) return false;
    if (input.status && task.formalStatus !== input.status) return false;
    if (input.importance && Number(task.importance) !== input.importance) return false;
    const status = stringValue(task.formalStatus);
    const due = taskDay(task.dueAt, timezone);
    if (input.view === "COMPLETED") return task.formalStatus === "COMPLETED";
    if (input.view === "TODAY") return status === "IN_PROGRESS"
      || (status === "UNSTARTED" && (due === today || task.timeLane === "TODAY_IF_POSSIBLE"));
    if (input.view === "OVERDUE") return task.formalStatus !== "COMPLETED" && Boolean(due) && due < today;
    if (input.view === "WEEK") return task.formalStatus !== "COMPLETED" && Boolean(due) && due >= today && due <= week;
    return true;
  });
  if (input.view !== "TODAY") return filtered;
  return filtered.sort((left, right) => {
    const leftDue = stringValue(left.dueAt) ? new Date(stringValue(left.dueAt)).getTime() : Number.POSITIVE_INFINITY;
    const rightDue = stringValue(right.dueAt) ? new Date(stringValue(right.dueAt)).getTime() : Number.POSITIVE_INFINITY;
    return leftDue - rightDue || Number(right.importance ?? 0) - Number(left.importance ?? 0);
  });
}

export class OzToolService {
  constructor(private readonly repository: OzToolRepository, private readonly timezone = "Asia/Tokyo") {}

  async execute(name: string, rawArguments: unknown, context: OzToolContext = {}) {
    const definition = getOzToolDefinition(name);
    if (!definition) throw new OzToolError("TOOL_NOT_FOUND", "The requested OZ tool is not available.", 404);
    const toolName = definition.name;
    const parsed = schemaByName[toolName].safeParse(rawArguments ?? {});
    if (!parsed.success) throw new OzToolError("INVALID_ARGUMENTS", "The tool arguments are invalid.");
    const args = parsed.data as Row;

    switch (toolName) {
      case "oz_get_context": {
        const data = await this.repository.getContext();
        return { ok: true, code: "CONTEXT_READY", data };
      }
      case "oz_get_daily_brief": {
        const data = await this.repository.getContext();
        return { ok: true, code: "DAILY_BRIEF_READY", data: buildDailyBrief({ ...data, connectors: data.integrations, timezone: this.timezone }) };
      }
      case "oz_list_projects": {
        const data = await this.repository.getContext();
        const status = args.status;
        const projects = status ? data.projects.filter((project) => project.status === String(status).toLowerCase() || project.formalStatus === status) : data.projects;
        return { ok: true, code: "PROJECTS_LISTED", data: { projects } };
      }
      case "oz_list_tasks": {
        const data = await this.repository.getContext();
        return { ok: true, code: "TASKS_LISTED", data: { tasks: filterTasks(data.tasks, parsed.data as z.infer<typeof toolListTasksSchema>, new Date(), this.timezone) } };
      }
      case "oz_get_task": {
        const data = await this.repository.getContext();
        const task = data.tasks.find((item) => item.id === args.taskId);
        if (!task) throw new OzToolError("TASK_NOT_FOUND", "The requested task was not found.", 404);
        return { ok: true, code: "TASK_READY", data: { task } };
      }
      case "oz_list_reviews": {
        const data = await this.repository.getContext();
        const reviews = args.status ? data.reviews.filter((review) => review.status === args.status) : data.reviews;
        return { ok: true, code: "REVIEWS_LISTED", data: { reviews } };
      }
      case "oz_create_project_candidate": {
        const candidate = parsed.data as z.infer<typeof toolCreateProjectCandidateSchema>;
        const idempotencyKey = requireIdempotency(context);
        const slug = projectSlug(candidate.name);
        const data = await this.repository.getContext();
        if (data.projects.some((project) => projectIdentity(project) === slug)) {
          throw new OzToolError("PROJECT_ALREADY_EXISTS", "A formal project with this name already exists.", 409);
        }
        if (data.reviews.some((review) => {
          if (review.kind !== "PROJECT_CREATE" || !["PENDING", "NEEDS_EDIT"].includes(stringValue(review.status))) return false;
          return projectIdentity(reviewCandidate(review)) === slug;
        })) {
          throw new OzToolError("PROJECT_CANDIDATE_ALREADY_PENDING", "A project candidate with this name already requires review.", 409);
        }
        const review = await this.repository.createReview({
          kind: "PROJECT_CREATE",
          sourceType: sourceType(context),
          candidate: { ...candidate, slug },
          idempotencyKey,
        });
        return { ok: true, code: "PROJECT_CANDIDATE_CREATED", data: { review, requiresApproval: true, formalProjectCreated: false } };
      }
      case "oz_create_task_candidate": {
        const candidate = parsed.data as z.infer<typeof toolCreateTaskCandidateSchema>;
        const idempotencyKey = requireIdempotency(context);
        const data = await this.repository.getContext();
        const projectId = candidate.projectId ?? null;
        const project = projectId ? data.projects.find((item) => item.id === projectId) : null;
        if (projectId && !project) {
          throw new OzToolError("PROJECT_NOT_FOUND", "The formal project required by this task candidate was not found.", 409);
        }
        if (candidate.source === "USER_CONFIRMED_INITIAL_CANDIDATE" && (!projectId || !project)) {
          throw new OzToolError("INITIAL_PROJECT_APPROVAL_REQUIRED", "Approve the initial project before creating its task candidate.", 409);
        }
        if (project && candidate.projectCandidate
          && normalizedIdentity(project.name) !== normalizedIdentity(candidate.projectCandidate)) {
          throw new OzToolError("PROJECT_IDENTITY_MISMATCH", "The project name does not match the formal project ID.", 409);
        }
        const taskIdentity = normalizedIdentity(candidate.title);
        if (projectId && data.tasks.some((task) => task.projectId === projectId && normalizedIdentity(task.title) === taskIdentity)) {
          throw new OzToolError("TASK_ALREADY_EXISTS", "A formal task with this title already exists in the project.", 409);
        }
        if (projectId && data.reviews.some((review) => {
          if (review.kind !== "TASK_CREATE" || !["PENDING", "NEEDS_EDIT"].includes(stringValue(review.status))) return false;
          const pending = reviewCandidate(review);
          return pending.projectId === projectId && normalizedIdentity(pending.title) === taskIdentity;
        })) {
          throw new OzToolError("TASK_CANDIDATE_ALREADY_PENDING", "A task candidate with this title already requires review in the project.", 409);
        }
        const review = await this.repository.createReview({
          kind: "TASK_CREATE",
          sourceType: sourceType(context),
          candidate: candidate as Row,
          idempotencyKey,
        });
        return { ok: true, code: "TASK_CANDIDATE_CREATED", data: { review, requiresApproval: true, formalTaskCreated: false } };
      }
      case "oz_propose_task_update": {
        const candidate = parsed.data as z.infer<typeof toolProposeTaskUpdateSchema>;
        const review = await this.repository.createReview({
          kind: "TASK_EDIT",
          sourceType: sourceType(context),
          candidate: { taskId: candidate.taskId, ...candidate.patch },
          targetId: candidate.taskId,
          idempotencyKey: requireIdempotency(context),
        });
        return { ok: true, code: "TASK_UPDATE_PROPOSED", data: { review, requiresApproval: true, taskChanged: false } };
      }
      case "oz_propose_task_status_change": {
        const candidate = parsed.data as z.infer<typeof toolProposeTaskStatusChangeSchema>;
        const review = await this.repository.createReview({
          kind: "TASK_STATUS_CHANGE",
          sourceType: sourceType(context),
          candidate,
          targetId: candidate.taskId,
          idempotencyKey: requireIdempotency(context),
        });
        return { ok: true, code: "TASK_STATUS_PROPOSED", data: { review, requiresApproval: true, taskChanged: false } };
      }
      case "oz_resolve_review": {
        const input = parsed.data as z.infer<typeof toolResolveReviewSchema>;
        const outcome = await this.repository.resolveReview({ ...input, idempotencyKey: requireIdempotency(context) });
        return { ok: true, code: "REVIEW_RESOLVED", data: { outcome } };
      }
      case "oz_propose_external_action": {
        const input = parsed.data as z.infer<typeof proposeExternalActionSchema>;
        const action = await this.repository.proposeExternalAction({ ...input, idempotencyKey: requireIdempotency(context) });
        return { ok: true, code: "EXTERNAL_ACTION_PROPOSED", data: { action, status: "PROPOSED", executed: false, requiresApproval: true } };
      }
    }
  }
}
