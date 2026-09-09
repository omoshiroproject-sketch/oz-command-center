-- Historical D1 schema-only migration retained for read-only legacy comparison.
-- The former production-like fixture rows were backed up under
-- data/legacy-d1/private/ before removal and are not auto-migrated.
CREATE TABLE `oz_projects` (
  `id` text PRIMARY KEY NOT NULL,
  `owner_id` text NOT NULL,
  `slug` text NOT NULL,
  `name` text NOT NULL,
  `purpose` text NOT NULL,
  `current_state` text NOT NULL,
  `responsible` text NOT NULL,
  `status` text DEFAULT 'active' NOT NULL,
  `step_status` text DEFAULT 'provisional' NOT NULL,
  `kpi_label` text NOT NULL,
  `kpi_current` integer NOT NULL,
  `kpi_milestone` integer NOT NULL,
  `kpi_target` integer NOT NULL,
  `kpi_unit` text NOT NULL,
  `plan_milestone` integer,
  `plan_target` integer,
  `milestone_due_at` text NOT NULL,
  `target_due_at` text NOT NULL,
  `drive_url` text,
  `slack_url` text,
  `slack_channel_id` text,
  `slack_status` text DEFAULT 'needs-review' NOT NULL,
  `chatwork_url` text,
  `chatwork_room_id` text,
  `chatwork_status` text DEFAULT 'needs-auth' NOT NULL,
  `source_note` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oz_projects_owner_slug_idx` ON `oz_projects` (`owner_id`,`slug`);
--> statement-breakpoint
CREATE INDEX `oz_projects_owner_updated_idx` ON `oz_projects` (`owner_id`,`updated_at`);
