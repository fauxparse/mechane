ALTER TABLE "custom_domains" ADD COLUMN "status_changed_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "custom_domains" ADD COLUMN "check_window_started_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "custom_domains" ADD COLUMN "provider_added_at" timestamp;--> statement-breakpoint
ALTER TABLE "custom_domains" ADD COLUMN "last_verified_at" timestamp;