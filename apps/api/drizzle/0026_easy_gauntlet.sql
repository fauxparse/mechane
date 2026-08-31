CREATE TABLE "player_events" (
	"run_id" text NOT NULL,
	"show_id" text NOT NULL,
	"device_id" text NOT NULL,
	"event_id" text NOT NULL,
	"observed_scene_id" text NOT NULL,
	"element_id" text NOT NULL,
	"event_kind" text NOT NULL,
	"outcome" text NOT NULL,
	"reason" text,
	"resulting_scene_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "player_events_run_id_device_id_event_id_pk" PRIMARY KEY("run_id","device_id","event_id")
);
--> statement-breakpoint
ALTER TABLE "player_events" ADD CONSTRAINT "player_events_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_events" ADD CONSTRAINT "player_events_show_id_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_events" ADD CONSTRAINT "player_events_device_fk" FOREIGN KEY ("show_id","device_id") REFERENCES "public"."devices"("show_id","id") ON DELETE cascade ON UPDATE no action;