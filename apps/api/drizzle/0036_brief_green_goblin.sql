CREATE TABLE "run_errors" (
	"id" text PRIMARY KEY NOT NULL,
	"show_id" text NOT NULL,
	"run_id" text,
	"category" text NOT NULL,
	"device_id" text,
	"scene_id" text,
	"element_id" text,
	"cue_id" text,
	"action_id" text,
	"event_id" text,
	"published_graph_version" integer,
	"occurred_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "run_errors" ADD CONSTRAINT "run_errors_show_id_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_errors" ADD CONSTRAINT "run_errors_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "run_errors_show_occurred_idx" ON "run_errors" USING btree ("show_id","occurred_at");--> statement-breakpoint
CREATE INDEX "run_errors_run_occurred_idx" ON "run_errors" USING btree ("run_id","occurred_at");