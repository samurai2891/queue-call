CREATE INDEX `idx_reservations_store_date` ON `reservations` (`storeId`,`reservationDate`);--> statement-breakpoint
CREATE INDEX `idx_reservations_store_status` ON `reservations` (`storeId`,`status`);--> statement-breakpoint
CREATE INDEX `idx_tickets_store_status` ON `tickets` (`storeId`,`status`);--> statement-breakpoint
CREATE INDEX `idx_tickets_store_daykey` ON `tickets` (`storeId`,`dayKey`);--> statement-breakpoint
CREATE INDEX `idx_tickets_store_created` ON `tickets` (`storeId`,`createdAt`);