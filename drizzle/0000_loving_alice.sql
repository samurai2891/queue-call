CREATE TABLE IF NOT EXISTS `feed_posts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`isActive` boolean NOT NULL DEFAULT true,
	`photoLargeUrl` text NOT NULL,
	`photoSmallUrl` text,
	`titleJa` varchar(255),
	`titleEn` varchar(255),
	`titleKo` varchar(255),
	`titleZhHans` varchar(255),
	`titleZhHant` varchar(255),
	`captionJa` text,
	`captionEn` text,
	`captionKo` text,
	`captionZhHans` text,
	`captionZhHant` text,
	`price` int,
	`linkedMenuItemId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `feed_posts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `menu_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`isActive` boolean NOT NULL DEFAULT true,
	`nameJa` varchar(255) NOT NULL,
	`nameEn` varchar(255),
	`nameKo` varchar(255),
	`nameZhHans` varchar(255),
	`nameZhHant` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `menu_categories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `menu_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`categoryId` int,
	`price` int NOT NULL DEFAULT 0,
	`sortOrder` int NOT NULL DEFAULT 0,
	`isActive` boolean NOT NULL DEFAULT true,
	`nameJa` varchar(255) NOT NULL,
	`nameEn` varchar(255),
	`nameKo` varchar(255),
	`nameZhHans` varchar(255),
	`nameZhHant` varchar(255),
	`descJa` text,
	`descEn` text,
	`descKo` text,
	`descZhHans` text,
	`descZhHant` text,
	`photoLargeUrl` text,
	`photoSmallUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `menu_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `push_subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ticketId` int NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` varchar(255) NOT NULL,
	`auth` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `push_subscriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `queue_audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`ticketId` int NOT NULL,
	`action` enum('MOVE_UP','MOVE_DOWN','CALL_SPECIFIC','SKIP','RECALL') NOT NULL,
	`reason` text,
	`performedBy` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `queue_audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sms_subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ticketId` int NOT NULL,
	`phoneE164` varchar(20) NOT NULL,
	`verifiedAt` timestamp,
	`optedOutAt` timestamp,
	`lastSentAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sms_subscriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `staff_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`sessionToken` varchar(64) NOT NULL,
	`role` enum('staff','manager') NOT NULL,
	`reorderModeEnabled` boolean NOT NULL DEFAULT false,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `staff_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `staff_sessions_sessionToken_unique` UNIQUE(`sessionToken`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `stores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`ownerId` int NOT NULL,
	`staffPinHash` varchar(255),
	`managerPinHash` varchar(255),
	`intakeStatus` enum('open','paused') NOT NULL DEFAULT 'open',
	`defaultLocale` varchar(10) NOT NULL DEFAULT 'ja',
	`supportedLocales` json,
	`resetTime` varchar(5) NOT NULL DEFAULT '04:00',
	`currentNumber` int NOT NULL DEFAULT 0,
	`dayKey` varchar(10),
	`kioskKey` varchar(64),
	`boardKey` varchar(64),
	`settings` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `stores_id` PRIMARY KEY(`id`),
	CONSTRAINT `stores_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `tickets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`ticketToken` varchar(64) NOT NULL,
	`dayKey` varchar(10) NOT NULL,
	`number` int NOT NULL,
	`partySize` int NOT NULL,
	`note` text,
	`locale` varchar(10) DEFAULT 'ja',
	`source` enum('web','qr','kiosk') NOT NULL DEFAULT 'web',
	`status` enum('WAITING','CALLED','ARRIVED','SKIPPED','DONE','CANCELED','EXPIRED') NOT NULL DEFAULT 'WAITING',
	`queueRank` varchar(64),
	`calledAt` timestamp,
	`arrivedAt` timestamp,
	`doneAt` timestamp,
	`canceledAt` timestamp,
	`checkinDeadlineAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tickets_id` PRIMARY KEY(`id`),
	CONSTRAINT `tickets_ticketToken_unique` UNIQUE(`ticketToken`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
