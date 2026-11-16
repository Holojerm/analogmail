CREATE TABLE `key_wraps` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`credential_id` text DEFAULT '' NOT NULL,
	`wrapped` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `key_wraps_secret_idx` ON `key_wraps` (`user_id`,`kind`,`credential_id`);--> statement-breakpoint
CREATE INDEX `key_wraps_user_idx` ON `key_wraps` (`user_id`);--> statement-breakpoint
CREATE TABLE `user_keys` (
	`user_id` text PRIMARY KEY NOT NULL,
	`public_key` text NOT NULL,
	`scheme` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
