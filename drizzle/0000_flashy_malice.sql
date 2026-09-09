CREATE TABLE `oz_memories` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`kind` text DEFAULT 'note' NOT NULL,
	`content` text NOT NULL,
	`project` text,
	`source` text DEFAULT 'oz' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `oz_memories_owner_created_idx` ON `oz_memories` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `oz_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`project` text,
	`status` text DEFAULT 'open' NOT NULL,
	`source` text DEFAULT 'oz' NOT NULL,
	`due_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `oz_tasks_owner_status_idx` ON `oz_tasks` (`owner_id`,`status`);--> statement-breakpoint
CREATE INDEX `oz_tasks_updated_idx` ON `oz_tasks` (`updated_at`);