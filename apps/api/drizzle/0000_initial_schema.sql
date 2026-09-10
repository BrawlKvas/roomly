CREATE TABLE `users` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `email` text NOT NULL,
  `email_key` text NOT NULL,
  `password_hash` text NOT NULL,
  `role` text NOT NULL CHECK (`role` IN ('employee', 'admin')),
  `created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_key_unique` ON `users` (`email_key`);
--> statement-breakpoint
CREATE TABLE `sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `token_hash` text NOT NULL,
  `user_id` text NOT NULL REFERENCES `users` (`id`) ON UPDATE no action ON DELETE cascade,
  `created_at` text NOT NULL,
  `expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_unique` ON `sessions` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `sessions_expires_at_idx` ON `sessions` (`expires_at`);
--> statement-breakpoint
CREATE INDEX `sessions_user_expires_idx` ON `sessions` (`user_id`, `expires_at`);
--> statement-breakpoint
CREATE TABLE `rooms` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `name_key` text NOT NULL,
  `floor` integer NOT NULL CHECK (`floor` BETWEEN 1 AND 99),
  `location` text NOT NULL,
  `capacity` integer NOT NULL CHECK (`capacity` BETWEEN 1 AND 1000),
  `description` text,
  `status` text NOT NULL DEFAULT 'available' CHECK (`status` IN ('available', 'unavailable')),
  `image_data` blob,
  `image_mime_type` text,
  `image_file_name` text,
  `version` integer NOT NULL DEFAULT 1,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rooms_name_key_unique` ON `rooms` (`name_key`);
--> statement-breakpoint
CREATE TABLE `equipment` (
  `code` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `room_equipment` (
  `room_id` text NOT NULL REFERENCES `rooms` (`id`) ON UPDATE no action ON DELETE cascade,
  `equipment_code` text NOT NULL REFERENCES `equipment` (`code`) ON UPDATE no action ON DELETE restrict,
  PRIMARY KEY (`room_id`, `equipment_code`)
);
--> statement-breakpoint
CREATE TABLE `bookings` (
  `id` text PRIMARY KEY NOT NULL,
  `owner_id` text NOT NULL REFERENCES `users` (`id`) ON UPDATE no action ON DELETE restrict,
  `room_id` text NOT NULL REFERENCES `rooms` (`id`) ON UPDATE no action ON DELETE restrict,
  `subject` text NOT NULL,
  `description` text,
  `participants` integer NOT NULL CHECK (`participants` >= 1),
  `starts_at` text NOT NULL,
  `ends_at` text NOT NULL CHECK (`ends_at` > `starts_at`),
  `version` integer NOT NULL DEFAULT 1,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `cancelled_at` text,
  `cancelled_by_user_id` text REFERENCES `users` (`id`) ON UPDATE no action ON DELETE restrict,
  `cancellation_type` text CHECK (`cancellation_type` IN ('owner', 'admin')),
  `cancellation_reason` text,
  `cancellation_actor_name` text,
  `cancellation_actor_email` text,
  `cancellation_actor_role` text CHECK (`cancellation_actor_role` IN ('employee', 'admin'))
);
--> statement-breakpoint
CREATE INDEX `bookings_room_interval_idx` ON `bookings` (`room_id`, `starts_at`, `ends_at`, `cancelled_at`);
--> statement-breakpoint
CREATE INDEX `bookings_owner_start_idx` ON `bookings` (`owner_id`, `starts_at`);
--> statement-breakpoint
CREATE INDEX `bookings_admin_room_start_idx` ON `bookings` (`room_id`, `starts_at`);
--> statement-breakpoint
CREATE INDEX `bookings_admin_owner_start_idx` ON `bookings` (`owner_id`, `starts_at`);
--> statement-breakpoint
CREATE INDEX `bookings_admin_cancelled_start_idx` ON `bookings` (`cancelled_at`, `starts_at`);
