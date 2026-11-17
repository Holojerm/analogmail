CREATE TABLE `mantel_news` (
	`mantel_id` text PRIMARY KEY NOT NULL,
	`correspondence_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mantel_news_correspondence_id_unique` ON `mantel_news` (`correspondence_id`);--> statement-breakpoint
ALTER TABLE `invites` ADD `news` integer DEFAULT false NOT NULL;