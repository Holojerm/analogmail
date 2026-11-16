CREATE TABLE `guest_links` (
	`id` text PRIMARY KEY NOT NULL,
	`mantel_id` text NOT NULL,
	`correspondence_id` text NOT NULL,
	`opens_on` text NOT NULL,
	`closes_on` text NOT NULL,
	`max_letters` integer DEFAULT 300 NOT NULL,
	`created_by` text,
	`revoked_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `guest_links_mantel_idx` ON `guest_links` (`mantel_id`);--> statement-breakpoint
ALTER TABLE `letters` ADD `origin` text DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE `letters` ADD `guest_link_id` text;