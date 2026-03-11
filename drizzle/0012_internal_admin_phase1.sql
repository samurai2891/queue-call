ALTER TABLE `users` ADD `is_test` boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE `stores` ADD `is_test` boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE `stores` ADD `test_plan_override` varchar(50);
