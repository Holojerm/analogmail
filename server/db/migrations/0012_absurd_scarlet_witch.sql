CREATE TABLE `room_albums` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`name` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `room_albums_family_idx` ON `room_albums` (`family_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `room_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`family_id` text NOT NULL,
	`album_id` text,
	`uploaded_by` text NOT NULL,
	`storage_key` text NOT NULL,
	`thumb_key` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`caption` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `room_photos_storage_key_unique` ON `room_photos` (`storage_key`);--> statement-breakpoint
CREATE INDEX `room_photos_family_idx` ON `room_photos` (`family_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `room_photos_album_idx` ON `room_photos` (`album_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `room_photos_uploader_idx` ON `room_photos` (`uploaded_by`);