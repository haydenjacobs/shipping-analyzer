CREATE TABLE `analyses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`shareable_token` text,
	`view_mode` text DEFAULT 'optimized' NOT NULL,
	`excluded_locations` text DEFAULT '[]' NOT NULL,
	`projected_order_count` integer,
	`projected_period` text DEFAULT 'year' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `app_metadata` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `excluded_orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`warehouse_id` integer,
	`reason` text NOT NULL,
	`details` text,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `order_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`warehouse_id` integer NOT NULL,
	`zone` integer NOT NULL,
	`billable_weight_value` real NOT NULL,
	`billable_weight_unit` text NOT NULL,
	`dim_weight_lbs` real,
	`rate_card_id` integer NOT NULL,
	`base_cost_cents` integer NOT NULL,
	`surcharge_cents` integer NOT NULL,
	`total_cost_cents` integer NOT NULL,
	`calculation_notes` text,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`rate_card_id`) REFERENCES `rate_cards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `order_results_order_id_idx` ON `order_results` (`order_id`);--> statement-breakpoint
CREATE INDEX `order_results_warehouse_id_idx` ON `order_results` (`warehouse_id`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`analysis_id` integer NOT NULL,
	`order_number` text NOT NULL,
	`dest_zip` text NOT NULL,
	`dest_zip3` text NOT NULL,
	`actual_weight_lbs` real NOT NULL,
	`height` real,
	`width` real,
	`length` real,
	`state` text,
	FOREIGN KEY (`analysis_id`) REFERENCES `analyses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `orders_analysis_id_idx` ON `orders` (`analysis_id`);--> statement-breakpoint
CREATE TABLE `rate_card_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`rate_card_id` integer NOT NULL,
	`weight_value` real NOT NULL,
	`weight_unit` text NOT NULL,
	`zone` integer NOT NULL,
	`price_cents` integer NOT NULL,
	FOREIGN KEY (`rate_card_id`) REFERENCES `rate_cards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `rate_cards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`warehouse_id` integer NOT NULL,
	`name` text NOT NULL,
	`weight_unit_mode` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `warehouses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`analysis_id` integer NOT NULL,
	`provider_name` text NOT NULL,
	`location_label` text NOT NULL,
	`origin_zip` text NOT NULL,
	`origin_zip3` text NOT NULL,
	`dim_weight_enabled` integer DEFAULT false NOT NULL,
	`dim_factor` integer,
	`surcharge_flat_cents` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`analysis_id`) REFERENCES `analyses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `warehouses_analysis_id_idx` ON `warehouses` (`analysis_id`);--> statement-breakpoint
CREATE TABLE `zone_maps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`origin_zip3` text NOT NULL,
	`dest_zip3` text NOT NULL,
	`zone` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `zone_maps_origin_dest` ON `zone_maps` (`origin_zip3`,`dest_zip3`);