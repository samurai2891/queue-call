ALTER TABLE `stores` ADD `is_test` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `stores` ADD `test_plan_override` varchar(50);--> statement-breakpoint
ALTER TABLE `users` ADD `is_test` boolean DEFAULT false NOT NULL;