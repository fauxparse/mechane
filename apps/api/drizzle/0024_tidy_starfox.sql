CREATE TABLE "graph_actions" (
	"id" text NOT NULL,
	"graph_id" text NOT NULL,
	"cue_id" text NOT NULL,
	"position" integer NOT NULL,
	"kind" text NOT NULL,
	"target_scene_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "graph_actions_graph_id_id_pk" PRIMARY KEY("graph_id","id"),
	CONSTRAINT "graph_actions_cue_position_unique" UNIQUE("graph_id","cue_id","position")
);
--> statement-breakpoint
CREATE TABLE "graph_cues" (
	"id" text NOT NULL,
	"graph_id" text NOT NULL,
	"scene_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "graph_cues_graph_id_id_pk" PRIMARY KEY("graph_id","id"),
	CONSTRAINT "graph_cues_scene_name_unique" UNIQUE("graph_id","scene_id","name")
);
--> statement-breakpoint
CREATE TABLE "graph_event_bindings" (
	"id" text NOT NULL,
	"graph_id" text NOT NULL,
	"canvas_id" text NOT NULL,
	"element_id" text NOT NULL,
	"event_kind" text NOT NULL,
	"cue_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "graph_event_bindings_graph_id_id_pk" PRIMARY KEY("graph_id","id"),
	CONSTRAINT "graph_event_bindings_element_event_unique" UNIQUE("graph_id","canvas_id","element_id","event_kind")
);
--> statement-breakpoint
ALTER TABLE "graph_actions" ADD CONSTRAINT "graph_actions_graph_id_show_graphs_id_fk" FOREIGN KEY ("graph_id") REFERENCES "public"."show_graphs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_actions" ADD CONSTRAINT "graph_actions_cue_fk" FOREIGN KEY ("graph_id","cue_id") REFERENCES "public"."graph_cues"("graph_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_actions" ADD CONSTRAINT "graph_actions_target_scene_fk" FOREIGN KEY ("graph_id","target_scene_id") REFERENCES "public"."graph_nodes"("graph_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_cues" ADD CONSTRAINT "graph_cues_graph_id_show_graphs_id_fk" FOREIGN KEY ("graph_id") REFERENCES "public"."show_graphs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_cues" ADD CONSTRAINT "graph_cues_scene_fk" FOREIGN KEY ("graph_id","scene_id") REFERENCES "public"."graph_nodes"("graph_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_event_bindings" ADD CONSTRAINT "graph_event_bindings_graph_id_show_graphs_id_fk" FOREIGN KEY ("graph_id") REFERENCES "public"."show_graphs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_event_bindings" ADD CONSTRAINT "graph_event_bindings_canvas_id_canvases_id_fk" FOREIGN KEY ("canvas_id") REFERENCES "public"."canvases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_event_bindings" ADD CONSTRAINT "graph_event_bindings_cue_fk" FOREIGN KEY ("graph_id","cue_id") REFERENCES "public"."graph_cues"("graph_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_event_bindings" ADD CONSTRAINT "graph_event_bindings_element_fk" FOREIGN KEY ("canvas_id","element_id") REFERENCES "public"."canvas_elements"("canvas_id","id") ON DELETE cascade ON UPDATE no action;