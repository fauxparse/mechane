CREATE TABLE "value_operations" (
	"id" text PRIMARY KEY NOT NULL,
	"show_id" text NOT NULL,
	"user_id" text NOT NULL,
	"target" jsonb NOT NULL,
	"request" jsonb NOT NULL,
	"plan" jsonb NOT NULL,
	"comparison" jsonb,
	"status" text DEFAULT 'prepared' NOT NULL,
	"receipt" jsonb,
	"diagnostic" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp,
	CONSTRAINT "value_operations_status" CHECK ("value_operations"."status" in ('prepared', 'committed', 'rejected'))
);
--> statement-breakpoint
ALTER TABLE "value_operations" ADD CONSTRAINT "value_operations_show_id_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "value_operations" ADD CONSTRAINT "value_operations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "value_operations_show_created_idx" ON "value_operations" USING btree ("show_id","created_at");