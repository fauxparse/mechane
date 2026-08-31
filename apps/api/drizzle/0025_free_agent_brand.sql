CREATE TABLE "run_device_states" (
	"run_id" text NOT NULL,
	"show_id" text NOT NULL,
	"device_id" text NOT NULL,
	"flow_id" text NOT NULL,
	"active_scene_id" text,
	"published_graph_version" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "run_device_states_run_id_device_id_pk" PRIMARY KEY("run_id","device_id")
);
--> statement-breakpoint
ALTER TABLE "run_device_states" ADD CONSTRAINT "run_device_states_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_device_states" ADD CONSTRAINT "run_device_states_show_id_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_device_states" ADD CONSTRAINT "run_device_states_device_fk" FOREIGN KEY ("show_id","device_id") REFERENCES "public"."devices"("show_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "run_device_states_show_idx" ON "run_device_states" USING btree ("show_id");