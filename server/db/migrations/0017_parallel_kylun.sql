CREATE TABLE `batch_guards` (
	`failed` text,
	CONSTRAINT "batch_guards_never" CHECK("batch_guards"."failed" IS NULL)
);
--> statement-breakpoint
ALTER TABLE `mantels` ADD `key_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `mantels` ADD `rekey_due_at` integer;