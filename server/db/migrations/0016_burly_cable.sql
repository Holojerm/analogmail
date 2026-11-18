ALTER TABLE `guest_links` ADD `secret_hash` text DEFAULT '' NOT NULL;
--> statement-breakpoint
-- A link made before secrets has none to present, so it can never be used
-- again. Revoked here so its keepers see "make the write link", not a dead address.
UPDATE `guest_links` SET `revoked_at` = unixepoch(), `updated_at` = unixepoch() WHERE `revoked_at` IS NULL AND `secret_hash` = '';
