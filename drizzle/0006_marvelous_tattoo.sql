ALTER TABLE `stores` ADD `currentCheckinPin` varchar(3);--> statement-breakpoint
ALTER TABLE `stores` ADD `checkinPinUpdatedAt` timestamp;--> statement-breakpoint
ALTER TABLE `tickets` ADD `checkinPinAttempts` int DEFAULT 0 NOT NULL;