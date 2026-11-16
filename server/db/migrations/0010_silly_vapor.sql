CREATE TABLE `mantel_recoveries` (
	`id` text PRIMARY KEY NOT NULL,
	`mantel_id` text NOT NULL,
	`claimant_id` text NOT NULL,
	`wrapped` text NOT NULL,
	`ready_at` integer NOT NULL,
	`cancelled_at` integer,
	`cancelled_by` text,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `mantel_recoveries_mantel_idx` ON `mantel_recoveries` (`mantel_id`);--> statement-breakpoint
ALTER TABLE `mantels` ADD `recovery_proof_hash` text;