import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const legacyOzProjects = sqliteTable("oz_projects", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), slug: text("slug").notNull(),
  name: text("name").notNull(), purpose: text("purpose").notNull(), currentState: text("current_state").notNull(),
  responsible: text("responsible").notNull(), status: text("status").notNull(), stepStatus: text("step_status").notNull(),
  kpiLabel: text("kpi_label").notNull(), kpiCurrent: integer("kpi_current").notNull(),
  kpiMilestone: integer("kpi_milestone").notNull(), kpiTarget: integer("kpi_target").notNull(),
  kpiUnit: text("kpi_unit").notNull(), planMilestone: integer("plan_milestone"), planTarget: integer("plan_target"),
  milestoneDueAt: text("milestone_due_at").notNull(), targetDueAt: text("target_due_at").notNull(),
  driveUrl: text("drive_url"), slackUrl: text("slack_url"), slackChannelId: text("slack_channel_id"),
  slackStatus: text("slack_status").notNull(), chatworkUrl: text("chatwork_url"),
  chatworkRoomId: text("chatwork_room_id"), chatworkStatus: text("chatwork_status").notNull(),
  sourceNote: text("source_note"), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("oz_projects_owner_slug_idx").on(table.ownerId, table.slug),
  index("oz_projects_owner_updated_idx").on(table.ownerId, table.updatedAt),
]);

export const legacyOzTasks = sqliteTable("oz_tasks", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), title: text("title").notNull(),
  project: text("project"), status: text("status").notNull(), source: text("source").notNull(),
  dueAt: text("due_at"), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (table) => [index("oz_tasks_owner_status_idx").on(table.ownerId, table.status)]);

export const legacyOzMemories = sqliteTable("oz_memories", {
  id: text("id").primaryKey(), ownerId: text("owner_id").notNull(), kind: text("kind").notNull(),
  content: text("content").notNull(), project: text("project"), source: text("source").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [index("oz_memories_owner_created_idx").on(table.ownerId, table.createdAt)]);
