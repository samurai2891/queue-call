CREATE TABLE `sms_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`storeId` int NOT NULL,
	`ticketId` int,
	`phoneE164` varchar(20) NOT NULL,
	`messageContent` text NOT NULL,
	`status` enum('pending','sent','delivered','failed') NOT NULL DEFAULT 'pending',
	`twilioMessageSid` varchar(64),
	`errorMessage` text,
	`creditConsumed` int NOT NULL DEFAULT 20,
	`messageType` enum('call','recall','reminder','custom') NOT NULL DEFAULT 'call',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`sentAt` timestamp,
	`deliveredAt` timestamp,
	CONSTRAINT `sms_logs_id` PRIMARY KEY(`id`)
);
