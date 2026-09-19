CREATE TABLE `plaid_accounts` (
	`owner` text NOT NULL,
	`id` text NOT NULL,
	`item_id` text NOT NULL,
	`source` text NOT NULL,
	`name` text NOT NULL,
	`mask` text,
	`active` integer DEFAULT 1 NOT NULL,
	PRIMARY KEY(`owner`, `id`)
);
--> statement-breakpoint
CREATE INDEX `idx_plaid_accounts_owner_item` ON `plaid_accounts` (`owner`,`item_id`);--> statement-breakpoint
CREATE TABLE `plaid_items` (
	`owner` text NOT NULL,
	`id` text NOT NULL,
	`access_token` text NOT NULL,
	`institution_id` text,
	`institution` text DEFAULT 'Connected card' NOT NULL,
	`cursor` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'connected' NOT NULL,
	`error_code` text,
	`last_synced` text,
	`sync_lock` text,
	`sync_lock_until` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`owner`, `id`)
);
--> statement-breakpoint
CREATE TABLE `plaid_link_sessions` (
	`owner` text NOT NULL,
	`id` text NOT NULL,
	`link_token` text NOT NULL,
	`update_item_id` text,
	`item_id` text,
	`expires_at` integer NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	PRIMARY KEY(`owner`, `id`)
);
--> statement-breakpoint
ALTER TABLE `transactions` ADD `provider` text DEFAULT 'csv' NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `account_id` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `pending` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `currency` text DEFAULT 'USD' NOT NULL;