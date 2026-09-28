CREATE TABLE "rate_limits" (
	"bucket" text NOT NULL,
	"key" text NOT NULL,
	"window_started_at" timestamp DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "rate_limits_bucket_key_pk" PRIMARY KEY("bucket","key")
);
--> statement-breakpoint
DROP TABLE "waitlist_rate_limits" CASCADE;--> statement-breakpoint
CREATE INDEX "rate_limits_bucket_window_idx" ON "rate_limits" USING btree ("bucket","window_started_at");