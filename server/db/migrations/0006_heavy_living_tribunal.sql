CREATE TABLE `mantel_keepers` (
	`id` text PRIMARY KEY NOT NULL,
	`mantel_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`added_by` text,
	`left_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mantel_keepers_seat_idx` ON `mantel_keepers` (`mantel_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `mantel_keepers_user_idx` ON `mantel_keepers` (`user_id`);--> statement-breakpoint
CREATE TABLE `mantel_key_wraps` (
	`id` text PRIMARY KEY NOT NULL,
	`mantel_id` text NOT NULL,
	`kind` text NOT NULL,
	`keeper_id` text DEFAULT '' NOT NULL,
	`wrapped` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mantel_key_wraps_holder_idx` ON `mantel_key_wraps` (`mantel_id`,`kind`,`keeper_id`);--> statement-breakpoint
CREATE TABLE `mantel_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`mantel_id` text NOT NULL,
	`kind` text NOT NULL,
	`subject_email` text,
	`subject_id` text,
	`role` text,
	`proposed_by` text NOT NULL,
	`accepted_at` integer,
	`outcome` text,
	`settled_at` integer,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `mantel_proposals_mantel_idx` ON `mantel_proposals` (`mantel_id`);--> statement-breakpoint
CREATE INDEX `mantel_proposals_email_idx` ON `mantel_proposals` (`subject_email`);--> statement-breakpoint
CREATE TABLE `mantel_votes` (
	`id` text PRIMARY KEY NOT NULL,
	`proposal_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mantel_votes_voter_idx` ON `mantel_votes` (`proposal_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `mantels` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`public_key` text NOT NULL,
	`scheme` integer DEFAULT 1 NOT NULL,
	`created_by` text,
	`closed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
