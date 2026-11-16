CREATE TABLE `families` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`organiser_id` text,
	`correspondence_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `families_correspondence_idx` ON `families` (`correspondence_id`);--> statement-breakpoint
ALTER TABLE `invites` ADD `family_id` text;