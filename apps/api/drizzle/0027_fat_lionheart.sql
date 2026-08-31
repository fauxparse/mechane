CREATE TABLE "player_invalidation_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"show_id" text NOT NULL,
	"device_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp DEFAULT now() NOT NULL,
	"lease_owner" text,
	"lease_expires_at" timestamp,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"delivered_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "player_invalidation_outbox" ADD CONSTRAINT "player_invalidation_outbox_show_id_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_invalidation_outbox" ADD CONSTRAINT "player_invalidation_outbox_device_fk" FOREIGN KEY ("show_id","device_id") REFERENCES "public"."devices"("show_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "player_invalidation_outbox_ready_idx" ON "player_invalidation_outbox" USING btree ("status","next_attempt_at","created_at");--> statement-breakpoint
CREATE INDEX "player_invalidation_outbox_device_order_idx" ON "player_invalidation_outbox" USING btree ("device_id","created_at","id");