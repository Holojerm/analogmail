CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_user_id` text NOT NULL,
	`actor_type` text DEFAULT 'admin' NOT NULL,
	`action` text NOT NULL,
	`target_type` text,
	`target_id` text,
	`metadata` text,
	`ip_hash` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_log_actor_user_id_created_idx` ON `audit_log` (`actor_user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`kind` text DEFAULT 'idea' NOT NULL,
	`message` text NOT NULL,
	`rating` integer,
	`email` text,
	`path` text,
	`replay_url` text,
	`posthog_distinct_id` text,
	`ip_hash` text,
	`user_agent` text,
	`status` text DEFAULT 'new' NOT NULL,
	`issue_url` text,
	`replied_at` integer,
	`replied_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `feedback_status_created_idx` ON `feedback` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `feedback_ip_hash_created_idx` ON `feedback` (`ip_hash`,`created_at`);--> statement-breakpoint
CREATE TABLE `instance_secrets` (
	`id` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `lifecycle_sends` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`step_id` text NOT NULL,
	`subject_key` text DEFAULT '' NOT NULL,
	`sent_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lifecycle_sends_user_step_subject_idx` ON `lifecycle_sends` (`user_id`,`step_id`,`subject_key`);--> statement-breakpoint
CREATE INDEX `lifecycle_sends_step_idx` ON `lifecycle_sends` (`step_id`);--> statement-breakpoint
CREATE TABLE `magic_link_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`redirect_to` text,
	`signup_source` text,
	`signup_medium` text,
	`signup_campaign` text,
	`signup_referrer` text,
	`mailbox` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `magic_link_tokens_token_hash_unique` ON `magic_link_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `magic_link_tokens_email_created_idx` ON `magic_link_tokens` (`email`,`created_at`);--> statement-breakpoint
CREATE INDEX `magic_link_tokens_mailbox_created_idx` ON `magic_link_tokens` (`mailbox`,`created_at`);--> statement-breakpoint
CREATE INDEX `magic_link_tokens_expires_at_idx` ON `magic_link_tokens` (`expires_at`);--> statement-breakpoint
CREATE INDEX `magic_link_tokens_used_at_idx` ON `magic_link_tokens` (`used_at`);--> statement-breakpoint
CREATE TABLE `notification_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`channel` text DEFAULT 'email' NOT NULL,
	`event_type` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_preferences_user_channel_event_idx` ON `notification_preferences` (`user_id`,`channel`,`event_type`);--> statement-breakpoint
CREATE TABLE `ops_events` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`detail` text,
	`path` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`avatar_url` text,
	`role` text DEFAULT 'user' NOT NULL,
	`provider` text,
	`last_login_at` integer,
	`sessions_invalid_before` integer,
	`signup_source` text,
	`signup_medium` text,
	`signup_campaign` text,
	`signup_referrer` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);