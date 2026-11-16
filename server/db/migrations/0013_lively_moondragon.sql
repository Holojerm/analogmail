CREATE TABLE `room_checkins` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`user_id` text NOT NULL,
	`city_name` text NOT NULL,
	`country` text NOT NULL,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `room_checkins_family_idx` ON `room_checkins` (`family_id`,`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `room_checkins_user_idx` ON `room_checkins` (`user_id`);