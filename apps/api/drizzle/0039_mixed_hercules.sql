CREATE TABLE "graph_cue_parameters" (
	"id" text NOT NULL,
	"graph_id" text NOT NULL,
	"cue_id" text NOT NULL,
	"name" text NOT NULL,
	"type" jsonb NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "graph_cue_parameters_graph_id_id_pk" PRIMARY KEY("graph_id","id"),
	CONSTRAINT "graph_cue_parameters_name_unique" UNIQUE("graph_id","cue_id","name"),
	CONSTRAINT "graph_cue_parameters_position_unique" UNIQUE("graph_id","cue_id","position")
);
--> statement-breakpoint
CREATE TABLE "graph_slot_event_bindings" (
	"id" text NOT NULL,
	"graph_id" text NOT NULL,
	"slot_element_id" text NOT NULL,
	"source_cue_id" text NOT NULL,
	"target_cue_id" text NOT NULL,
	"position" integer NOT NULL,
	"parameter_mappings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "graph_slot_event_bindings_graph_id_id_pk" PRIMARY KEY("graph_id","id"),
	CONSTRAINT "graph_slot_event_bindings_position_unique" UNIQUE("graph_id","slot_element_id","position")
);
--> statement-breakpoint
ALTER TABLE "player_events" ADD COLUMN "slot_instance_path" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "graph_cue_parameters" ADD CONSTRAINT "graph_cue_parameters_graph_id_show_graphs_id_fk" FOREIGN KEY ("graph_id") REFERENCES "public"."show_graphs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_cue_parameters" ADD CONSTRAINT "graph_cue_parameters_cue_fk" FOREIGN KEY ("graph_id","cue_id") REFERENCES "public"."graph_cues"("graph_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_slot_event_bindings" ADD CONSTRAINT "graph_slot_event_bindings_graph_id_show_graphs_id_fk" FOREIGN KEY ("graph_id") REFERENCES "public"."show_graphs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_slot_event_bindings" ADD CONSTRAINT "graph_slot_event_bindings_source_cue_fk" FOREIGN KEY ("graph_id","source_cue_id") REFERENCES "public"."graph_cues"("graph_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_slot_event_bindings" ADD CONSTRAINT "graph_slot_event_bindings_target_cue_fk" FOREIGN KEY ("graph_id","target_cue_id") REFERENCES "public"."graph_cues"("graph_id","id") ON DELETE cascade ON UPDATE no action;