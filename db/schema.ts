import {
  boolean, check, index, integer, jsonb, pgEnum, pgTable, real, text, timestamp,
  uniqueIndex, uuid, varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const projectStatus = pgEnum("project_status", ["IDEA", "PLANNED", "ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"]);
export const taskStatus = pgEnum("task_status", ["UNSTARTED", "IN_PROGRESS", "WAITING", "ON_HOLD", "COMPLETED"]);
export const reviewStatus = pgEnum("review_status", ["PENDING", "APPROVED", "REJECTED", "NEEDS_EDIT"]);
export const reviewKind = pgEnum("review_kind", ["TASK_CREATE", "TASK_STATUS_CHANGE", "TASK_EDIT", "PROJECT_CREATE", "EXTERNAL_ACTION"]);
export const reviewSourceType = pgEnum("review_source_type", ["QUICK_ADD", "VOICE", "CHAT", "EMAIL", "MEETING", "CONNECTOR", "MANUAL"]);
export const externalActionStatus = pgEnum("external_action_status", ["PROPOSED", "APPROVED", "EXECUTING", "SUCCEEDED", "FAILED", "CANCELLED"]);
export const approvalDecision = pgEnum("approval_decision", ["APPROVED", "REJECTED"]);
export const idempotencyStatus = pgEnum("idempotency_status", ["PROCESSING", "SUCCEEDED", "FAILED"]);
export const executionEnvironment = pgEnum("execution_environment", ["ANY", "MOBILE", "PC", "TRAVEL_OK", "CALL", "IN_PERSON"]);
export const timeLane = pgEnum("time_lane", ["DUE", "TODAY_IF_POSSIBLE", "SOMEDAY"]);
export const delegationState = pgEnum("delegation_state", ["SELF", "CANDIDATE", "DELEGATED"]);

const ownedTimestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(), ownerId: uuid("owner_id").notNull(),
  slug: varchar("slug", { length: 120 }).notNull(), name: varchar("name", { length: 180 }).notNull(),
  description: text("description"), status: projectStatus("status").notNull().default("PLANNED"),
  importance: integer("importance").notNull().default(3),
  progressCountingMode: varchar("progress_counting_mode", { length: 32 }).notNull().default("LEAF_TASKS"),
  ...ownedTimestamps,
}, (table) => [
  uniqueIndex("projects_owner_slug_uq").on(table.ownerId, table.slug),
  index("projects_owner_status_idx").on(table.ownerId, table.status),
  check("projects_importance_ck", sql`${table.importance} between 1 and 5`),
  check("projects_progress_mode_ck", sql`${table.progressCountingMode} in ('ALL_TASKS', 'LEAF_TASKS', 'TOP_LEVEL')`),
]);

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(), ownerId: uuid("owner_id").notNull(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }), parentTaskId: uuid("parent_task_id"),
  title: varchar("title", { length: 180 }).notNull(), description: text("description"),
  status: taskStatus("status").notNull().default("UNSTARTED"), timeLane: timeLane("time_lane").notNull().default("SOMEDAY"),
  importance: integer("importance").notNull().default(3), urgencyOverride: real("urgency_override"),
  estimatedMinutes: integer("estimated_minutes"), actualMinutes: integer("actual_minutes"),
  assigneeLabel: varchar("assignee_label", { length: 180 }), delegationState: delegationState("delegation_state").notNull().default("SELF"),
  delegateLabel: varchar("delegate_label", { length: 180 }), contactChannel: varchar("contact_channel", { length: 80 }),
  executionEnvironment: executionEnvironment("execution_environment").notNull().default("ANY"),
  location: varchar("location", { length: 240 }), travelAllowed: boolean("travel_allowed").notNull().default(false),
  blockReason: text("block_reason"), dueAt: timestamp("due_at", { withTimezone: true }),
  calendarBlockExternalId: varchar("calendar_block_external_id", { length: 240 }),
  progressEligible: boolean("progress_eligible").notNull().default(true), createdBy: uuid("created_by").notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }), ...ownedTimestamps,
}, (table) => [
  index("tasks_owner_status_idx").on(table.ownerId, table.status), index("tasks_owner_due_idx").on(table.ownerId, table.dueAt),
  index("tasks_project_idx").on(table.projectId), check("tasks_importance_ck", sql`${table.importance} between 1 and 5`),
  check("tasks_estimated_minutes_ck", sql`${table.estimatedMinutes} is null or ${table.estimatedMinutes} >= 0`),
  check("tasks_actual_minutes_ck", sql`${table.actualMinutes} is null or ${table.actualMinutes} >= 0`),
]);

export const taskDependencies = pgTable("task_dependencies", {
  id: uuid("id").primaryKey().defaultRandom(), ownerId: uuid("owner_id").notNull(),
  taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  dependsOnTaskId: uuid("depends_on_task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("task_dependencies_pair_uq").on(table.ownerId, table.taskId, table.dependsOnTaskId),
  index("task_dependencies_owner_idx").on(table.ownerId),
  check("task_dependencies_distinct_ck", sql`${table.taskId} <> ${table.dependsOnTaskId}`),
]);

export const taskSources = pgTable("task_sources", {
  id: uuid("id").primaryKey().defaultRandom(), ownerId: uuid("owner_id").notNull(),
  taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  sourceType: reviewSourceType("source_type").notNull(), sourceLocator: text("source_locator"),
  evidenceExcerpt: text("evidence_excerpt"), sourceOccurredAt: timestamp("source_occurred_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("task_sources_owner_task_idx").on(table.ownerId, table.taskId)]);

export const reviewItems = pgTable("review_items", {
  id: uuid("id").primaryKey().defaultRandom(), ownerId: uuid("owner_id").notNull(),
  kind: reviewKind("kind").notNull(), sourceType: reviewSourceType("source_type").notNull(),
  status: reviewStatus("status").notNull().default("PENDING"), candidateData: jsonb("candidate_data").notNull(),
  targetType: varchar("target_type", { length: 80 }), targetId: uuid("target_id"),
  approvedEntityType: varchar("approved_entity_type", { length: 80 }), approvedEntityId: uuid("approved_entity_id"),
  submittedBy: uuid("submitted_by").notNull(), resolvedBy: uuid("resolved_by"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }), rejectionReason: text("rejection_reason"),
  version: integer("version").notNull().default(1), ...ownedTimestamps,
}, (table) => [
  index("review_items_owner_status_idx").on(table.ownerId, table.status, table.createdAt),
  check("review_items_candidate_object_ck", sql`jsonb_typeof(${table.candidateData}) = 'object'`),
]);

export const externalActions = pgTable("external_actions", {
  id: uuid("id").primaryKey().defaultRandom(), ownerId: uuid("owner_id").notNull(),
  provider: varchar("provider", { length: 80 }).notNull(), actionType: varchar("action_type", { length: 120 }).notNull(),
  status: externalActionStatus("status").notNull().default("PROPOSED"), requestPayload: jsonb("request_payload").notNull(),
  targetFingerprint: varchar("target_fingerprint", { length: 128 }).notNull(), externalId: varchar("external_id", { length: 240 }),
  approvedAt: timestamp("approved_at", { withTimezone: true }), executedAt: timestamp("executed_at", { withTimezone: true }),
  resultCode: varchar("result_code", { length: 80 }), ...ownedTimestamps,
}, (table) => [index("external_actions_owner_status_idx").on(table.ownerId, table.status, table.createdAt)]);

export const actionApprovals = pgTable("action_approvals", {
  id: uuid("id").primaryKey().defaultRandom(), ownerId: uuid("owner_id").notNull(),
  externalActionId: uuid("external_action_id").notNull().references(() => externalActions.id, { onDelete: "cascade" }),
  decidedBy: uuid("decided_by").notNull(), decision: approvalDecision("decision").notNull(),
  actionSnapshotHash: varchar("action_snapshot_hash", { length: 128 }).notNull(),
  decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("action_approvals_owner_action_idx").on(table.ownerId, table.externalActionId)]);

export const idempotencyKeys = pgTable("idempotency_keys", {
  id: uuid("id").primaryKey().defaultRandom(), ownerId: uuid("owner_id").notNull(),
  scope: varchar("scope", { length: 120 }).notNull(), keyHash: varchar("key_hash", { length: 128 }).notNull(),
  requestHash: varchar("request_hash", { length: 128 }).notNull(), status: idempotencyStatus("status").notNull(),
  resourceType: varchar("resource_type", { length: 80 }), resourceId: uuid("resource_id"), responseCode: integer("response_code"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("idempotency_keys_owner_scope_key_uq").on(table.ownerId, table.scope, table.keyHash),
  index("idempotency_keys_expires_idx").on(table.expiresAt),
]);

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(), ownerId: uuid("owner_id").notNull(), actorId: uuid("actor_id").notNull(),
  action: varchar("action", { length: 120 }).notNull(), targetType: varchar("target_type", { length: 80 }).notNull(),
  targetId: uuid("target_id"), outcome: varchar("outcome", { length: 40 }).notNull(), approvalId: uuid("approval_id"),
  traceId: uuid("trace_id").notNull().defaultRandom(), beforeState: jsonb("before_state").notNull().default(sql`'{}'::jsonb`),
  afterState: jsonb("after_state").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("audit_logs_owner_created_idx").on(table.ownerId, table.createdAt)]);
