ALTER TABLE `users`
  ADD COLUMN `status` enum('active','suspended') NOT NULL DEFAULT 'active';
