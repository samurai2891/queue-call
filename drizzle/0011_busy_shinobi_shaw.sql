CREATE TABLE `staff_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`canCall` boolean NOT NULL DEFAULT true,
	`canEditSettings` boolean NOT NULL DEFAULT false,
	`canManage` boolean NOT NULL DEFAULT false,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `staff_members_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `staff_sessions` ADD `staffMemberId` int;--> statement-breakpoint
CREATE INDEX `idx_staff_members_store` ON `staff_members` (`storeId`);