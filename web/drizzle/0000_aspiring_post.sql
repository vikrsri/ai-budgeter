CREATE TABLE `transactions` (
	`owner` text NOT NULL,
	`id` text NOT NULL,
	`date` text NOT NULL,
	`merchant` text NOT NULL,
	`amount` integer NOT NULL,
	`source` text NOT NULL,
	`category` text NOT NULL,
	`kind` text NOT NULL,
	`imported_at` text NOT NULL,
	PRIMARY KEY(`owner`, `id`)
);
--> statement-breakpoint
CREATE INDEX `idx_transactions_owner_date` ON `transactions` (`owner`,`date`);