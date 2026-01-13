CREATE TABLE `sms_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`type` enum('charge','consume','refund') NOT NULL,
	`amount` int NOT NULL,
	`balanceAfter` int NOT NULL,
	`stripePaymentIntentId` varchar(255),
	`stripeCheckoutSessionId` varchar(255),
	`ticketId` int,
	`smsMessageSid` varchar(64),
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sms_transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `stores` ADD `smsBalance` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `stores` ADD `stripeCustomerId` varchar(255);