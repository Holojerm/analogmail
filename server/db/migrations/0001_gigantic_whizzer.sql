CREATE TABLE `cities` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`search_name` text NOT NULL,
	`region` text,
	`country` text NOT NULL,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`time_zone` text NOT NULL,
	`population` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cities_search_idx` ON `cities` (`search_name`);--> statement-breakpoint
CREATE TABLE `correspondence_members` (
	`id` text PRIMARY KEY NOT NULL,
	`correspondence_id` text NOT NULL,
	`user_id` text NOT NULL,
	`left_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `correspondence_members_pair_idx` ON `correspondence_members` (`correspondence_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `correspondence_members_user_idx` ON `correspondence_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `correspondences` (
	`id` text PRIMARY KEY NOT NULL,
	`closed_at` integer,
	`closed_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`letter_id` text NOT NULL,
	`recipient_id` text NOT NULL,
	`kind` text DEFAULT 'letter' NOT NULL,
	`earliest_date` text NOT NULL,
	`promised_date` text NOT NULL,
	`transit_days` integer NOT NULL,
	`state` text DEFAULT 'in_transit' NOT NULL,
	`delivered_at` integer,
	`opened_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `deliveries_letter_recipient_idx` ON `deliveries` (`letter_id`,`recipient_id`,`kind`);--> statement-breakpoint
CREATE INDEX `deliveries_due_idx` ON `deliveries` (`recipient_id`,`state`,`earliest_date`);--> statement-breakpoint
CREATE TABLE `invites` (
	`id` text PRIMARY KEY NOT NULL,
	`inviter_id` text NOT NULL,
	`invitee_email` text,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`accepted_at` integer,
	`accepted_by` text,
	`correspondence_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invites_token_hash_unique` ON `invites` (`token_hash`);--> statement-breakpoint
CREATE INDEX `invites_inviter_idx` ON `invites` (`inviter_id`);--> statement-breakpoint
CREATE INDEX `invites_expires_idx` ON `invites` (`expires_at`);--> statement-breakpoint
CREATE TABLE `letter_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`letter_id` text NOT NULL,
	`user_id` text NOT NULL,
	`wrapped_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `letter_keys_reader_idx` ON `letter_keys` (`letter_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `letter_keys_user_idx` ON `letter_keys` (`user_id`);--> statement-breakpoint
CREATE TABLE `letters` (
	`id` text PRIMARY KEY NOT NULL,
	`correspondence_id` text NOT NULL,
	`author_id` text,
	`in_reply_to` text,
	`sealed_at` integer,
	`pickup_at` integer,
	`postmark_date` text,
	`ciphertext` text NOT NULL,
	`photo_key` text,
	`scheme` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `letters_correspondence_idx` ON `letters` (`correspondence_id`);--> statement-breakpoint
CREATE INDEX `letters_author_idx` ON `letters` (`author_id`);--> statement-breakpoint
CREATE TABLE `notices` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`mail_date` text NOT NULL,
	`channel` text DEFAULT 'email' NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`sent_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notices_user_date_idx` ON `notices` (`user_id`,`mail_date`);--> statement-breakpoint
CREATE INDEX `notices_state_idx` ON `notices` (`state`);--> statement-breakpoint
CREATE TABLE `postal_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`city_id` integer,
	`city_name` text NOT NULL,
	`country` text NOT NULL,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`time_zone` text NOT NULL,
	`mail_days` integer DEFAULT 63 NOT NULL,
	`delivery_hour` integer DEFAULT 10 NOT NULL,
	`pending_mail_days` integer,
	`pending_delivery_hour` integer,
	`pending_from` text,
	`last_release_date` text,
	`next_release_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `postal_profiles_next_release_idx` ON `postal_profiles` (`next_release_at`);