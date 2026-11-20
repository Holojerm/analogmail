CREATE TABLE `mantel_openings` (
	`mantel_id` text PRIMARY KEY NOT NULL,
	`on_arrival` integer DEFAULT true NOT NULL,
	`days` text NOT NULL,
	`changed_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
