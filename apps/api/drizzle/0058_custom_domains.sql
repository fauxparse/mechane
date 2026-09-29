CREATE TABLE "blocked_hostnames" (
	"id" text PRIMARY KEY NOT NULL,
	"hostname" text NOT NULL,
	"reason" text NOT NULL,
	"placed_by" text NOT NULL,
	"placed_at" timestamp DEFAULT now() NOT NULL,
	"lifted_by" text,
	"lifted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "custom_domains" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"hostname" text NOT NULL,
	"status" text NOT NULL,
	"proof_token" text NOT NULL,
	"dns_records" jsonb,
	"added_at" timestamp DEFAULT now() NOT NULL,
	"proven_at" timestamp,
	"last_checked_at" timestamp,
	"next_check_due_at" timestamp,
	"went_live_at" timestamp,
	"proof_went_missing_at" timestamp,
	"status_reason" text,
	"revocation_reason" text,
	"device_show_id" text,
	"device_id" text,
	CONSTRAINT "custom_domains_user_hostname_unique" UNIQUE("user_id","hostname")
);
--> statement-breakpoint
ALTER TABLE "custom_domains" ADD CONSTRAINT "custom_domains_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_domains" ADD CONSTRAINT "custom_domains_device_fk" FOREIGN KEY ("device_show_id","device_id") REFERENCES "public"."devices"("show_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "blocked_hostnames_hostname_active_unique" ON "blocked_hostnames" USING btree ("hostname") WHERE "blocked_hostnames"."lifted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "custom_domains_hostname_proven_unique" ON "custom_domains" USING btree ("hostname") WHERE "custom_domains"."status" in ('connecting', 'securing', 'live', 'needs_attention');--> statement-breakpoint
CREATE UNIQUE INDEX "custom_domains_device_unique" ON "custom_domains" USING btree ("device_show_id","device_id");