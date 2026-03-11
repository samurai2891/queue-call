ALTER TABLE `stores` ADD `subscriptionPlan` enum('free','standard','pro') DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE `stores` ADD `stripeSubscriptionId` varchar(255);--> statement-breakpoint
ALTER TABLE `stores` ADD `subscriptionStatus` varchar(32);--> statement-breakpoint
ALTER TABLE `stores` ADD `subscriptionCurrentPeriodEnd` timestamp;--> statement-breakpoint
ALTER TABLE `stores` ADD `monthlyTicketCount` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `stores` ADD `monthlyTicketResetDate` varchar(10);