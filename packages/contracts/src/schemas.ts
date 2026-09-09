import { z } from "zod";
import {
  EXECUTION_ENVIRONMENTS,
  EXTERNAL_ACTION_STATUSES,
  PROJECT_STATUSES,
  REVIEW_KINDS,
  REVIEW_SOURCE_TYPES,
  REVIEW_STATUSES,
  TASK_STATUSES,
  TIME_LANES,
} from "./index";

const nullableUuid = z.uuid().nullable().optional();

export const projectCandidateSchema = z.object({
  name: z.string().trim().min(1).max(180),
  description: z.string().trim().max(10_000).nullable().optional(),
  status: z.enum(PROJECT_STATUSES).default("PLANNED"),
  importance: z.number().int().min(1).max(5).default(3),
  targetDate: z.iso.date().nullable().optional(),
}).strict();

export const taskCandidateSchema = z.object({
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(10_000).nullable().optional(),
  projectId: nullableUuid,
  projectCandidate: z.string().trim().max(120).nullable().optional(),
  dueAt: z.iso.datetime({ offset: true }).nullable().optional(),
  estimatedMinutes: z.number().int().min(0).max(100_000).nullable().optional(),
  actualMinutes: z.number().int().min(0).max(100_000).nullable().optional(),
  importance: z.number().int().min(1).max(5).default(3),
  assigneeLabel: z.string().trim().max(180).nullable().optional(),
  delegationState: z.enum(["SELF", "CANDIDATE", "DELEGATED"]).default("SELF"),
  delegateLabel: z.string().trim().max(180).nullable().optional(),
  executionEnvironment: z.enum(EXECUTION_ENVIRONMENTS).default("ANY"),
  travelAllowed: z.boolean().default(false),
  blockReason: z.string().trim().max(2_000).nullable().optional(),
  timeLane: z.enum(TIME_LANES).default("SOMEDAY"),
  sourceEvidence: z.array(z.string().trim().max(500)).max(20).default([]),
  missingFields: z.array(z.string().trim().max(80)).max(20).default([]),
  confidence: z.number().min(0).max(1).nullable().optional(),
  source: z.literal("USER_CONFIRMED_INITIAL_CANDIDATE").optional(),
}).strict();

export const taskStatusCandidateSchema = z.object({
  taskId: z.uuid(),
  status: z.enum(TASK_STATUSES),
}).strict();

export const taskEditPatchSchema = z.object({
  title: z.string().trim().min(1).max(180).optional(),
  description: z.string().trim().max(10_000).nullable().optional(),
  projectId: nullableUuid,
  timeLane: z.enum(TIME_LANES).optional(),
  importance: z.number().int().min(1).max(5).optional(),
  dueAt: z.iso.datetime({ offset: true }).nullable().optional(),
  estimatedMinutes: z.number().int().min(0).max(100_000).nullable().optional(),
  actualMinutes: z.number().int().min(0).max(100_000).nullable().optional(),
  assigneeLabel: z.string().trim().max(180).nullable().optional(),
  delegationState: z.enum(["SELF", "CANDIDATE", "DELEGATED"]).optional(),
  delegateLabel: z.string().trim().max(180).nullable().optional(),
  executionEnvironment: z.enum(EXECUTION_ENVIRONMENTS).optional(),
  blockReason: z.string().trim().max(2_000).nullable().optional(),
  travelAllowed: z.boolean().optional(),
}).strict().refine((patch) => Object.keys(patch).length > 0, "At least one editable field is required.");

export const taskEditCandidateSchema = z.object({
  taskId: z.uuid(),
  patch: taskEditPatchSchema,
}).strict();

export const toolListProjectsSchema = z.object({
  status: z.enum(PROJECT_STATUSES).optional(),
}).strict();

export const toolListTasksSchema = z.object({
  projectId: z.uuid().optional(),
  status: z.enum(TASK_STATUSES).optional(),
  view: z.enum(["TODAY", "OVERDUE", "WEEK", "ALL", "COMPLETED"]).optional(),
  importance: z.number().int().min(1).max(5).optional(),
}).strict();

export const toolGetTaskSchema = z.object({ taskId: z.uuid() }).strict();

export const toolListReviewsSchema = z.object({
  status: z.enum(REVIEW_STATUSES).optional(),
}).strict();

export const toolCreateProjectCandidateSchema = projectCandidateSchema;
export const toolCreateTaskCandidateSchema = taskCandidateSchema;
export const toolProposeTaskUpdateSchema = taskEditCandidateSchema;
export const toolProposeTaskStatusChangeSchema = taskStatusCandidateSchema;

export const toolResolveReviewSchema = z.object({
  reviewId: z.uuid(),
  decision: z.enum(["APPROVED", "REJECTED", "NEEDS_EDIT"]),
  edits: z.record(z.string(), z.unknown()).optional(),
  reason: z.string().trim().max(500).optional(),
}).strict();

export const createReviewRequestSchema = z.object({
  kind: z.enum(REVIEW_KINDS),
  sourceType: z.enum(REVIEW_SOURCE_TYPES),
  candidate: z.record(z.string(), z.unknown()),
}).strict();

export const resolveReviewRequestSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED", "NEEDS_EDIT"]),
  edits: z.record(z.string(), z.unknown()).optional(),
  reason: z.string().trim().max(500).optional(),
}).strict();

export const proposeExternalActionSchema = z.object({
  provider: z.string().trim().min(1).max(80),
  actionType: z.string().trim().min(1).max(120),
  requestPayload: z.record(z.string(), z.unknown()),
  targetFingerprint: z.string().trim().min(16).max(128),
}).strict();

export const emptyToolInputSchema = z.object({}).strict();

export const projectStatusSchema = z.enum(PROJECT_STATUSES);
export const taskStatusSchema = z.enum(TASK_STATUSES);
export const reviewStatusSchema = z.enum(REVIEW_STATUSES);
export const externalActionStatusSchema = z.enum(EXTERNAL_ACTION_STATUSES);

export function parseTaskCandidate(value: unknown) {
  return taskCandidateSchema.parse(value);
}
