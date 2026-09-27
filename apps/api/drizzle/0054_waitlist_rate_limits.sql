CREATE TABLE "waitlist_rate_limits" (
	"client_address" text PRIMARY KEY NOT NULL,
	"window_started_at" timestamp DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "waitlist_rate_limits_window_idx" ON "waitlist_rate_limits" USING btree ("window_started_at");