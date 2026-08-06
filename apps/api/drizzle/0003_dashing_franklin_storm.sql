CREATE TABLE "graph_edges" (
	"id" text NOT NULL,
	"graph_id" text NOT NULL,
	"kind" text NOT NULL,
	"source_node_id" text NOT NULL,
	"target_node_id" text NOT NULL,
	"target_variable_id" text,
	"cue_id" text,
	"action_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "graph_edges_graph_id_id_pk" PRIMARY KEY("graph_id","id"),
	CONSTRAINT "graph_edges_variable_target_is_wiring_only" CHECK (("graph_edges"."kind" = 'wiring') = ("graph_edges"."target_variable_id" is not null)),
	CONSTRAINT "graph_edges_pairing_is_navigate_only" CHECK ("graph_edges"."kind" = 'navigate' or ("graph_edges"."cue_id" is null and "graph_edges"."action_id" is null))
);
--> statement-breakpoint
CREATE TABLE "graph_node_variables" (
	"id" text NOT NULL,
	"graph_id" text NOT NULL,
	"scene_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "graph_node_variables_graph_id_id_pk" PRIMARY KEY("graph_id","id"),
	CONSTRAINT "graph_node_variables_scene_name_unique" UNIQUE("graph_id","scene_id","name")
);
--> statement-breakpoint
CREATE TABLE "graph_nodes" (
	"id" text NOT NULL,
	"graph_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"parent_id" text,
	"default_scene_id" text,
	"position_x" double precision DEFAULT 0 NOT NULL,
	"position_y" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "graph_nodes_graph_id_id_pk" PRIMARY KEY("graph_id","id"),
	CONSTRAINT "graph_nodes_no_nested_containers" CHECK ("graph_nodes"."kind" not in ('flow', 'device') or "graph_nodes"."parent_id" is null),
	CONSTRAINT "graph_nodes_default_scene_is_flow_only" CHECK ("graph_nodes"."kind" = 'flow' or "graph_nodes"."default_scene_id" is null)
);
--> statement-breakpoint
CREATE TABLE "show_graphs" (
	"id" text PRIMARY KEY NOT NULL,
	"show_id" text NOT NULL,
	"state" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "show_graphs_show_state_unique" UNIQUE("show_id","state")
);
--> statement-breakpoint
ALTER TABLE "graph_edges" ADD CONSTRAINT "graph_edges_graph_id_show_graphs_id_fk" FOREIGN KEY ("graph_id") REFERENCES "public"."show_graphs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_edges" ADD CONSTRAINT "graph_edges_source_fk" FOREIGN KEY ("graph_id","source_node_id") REFERENCES "public"."graph_nodes"("graph_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_edges" ADD CONSTRAINT "graph_edges_target_fk" FOREIGN KEY ("graph_id","target_node_id") REFERENCES "public"."graph_nodes"("graph_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_edges" ADD CONSTRAINT "graph_edges_target_variable_fk" FOREIGN KEY ("graph_id","target_variable_id") REFERENCES "public"."graph_node_variables"("graph_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_node_variables" ADD CONSTRAINT "graph_node_variables_graph_id_show_graphs_id_fk" FOREIGN KEY ("graph_id") REFERENCES "public"."show_graphs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_node_variables" ADD CONSTRAINT "graph_node_variables_scene_fk" FOREIGN KEY ("graph_id","scene_id") REFERENCES "public"."graph_nodes"("graph_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_nodes" ADD CONSTRAINT "graph_nodes_graph_id_show_graphs_id_fk" FOREIGN KEY ("graph_id") REFERENCES "public"."show_graphs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_nodes" ADD CONSTRAINT "graph_nodes_parent_fk" FOREIGN KEY ("graph_id","parent_id") REFERENCES "public"."graph_nodes"("graph_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "show_graphs" ADD CONSTRAINT "show_graphs_show_id_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "graph_edges_source_idx" ON "graph_edges" USING btree ("graph_id","source_node_id");--> statement-breakpoint
CREATE INDEX "graph_edges_target_idx" ON "graph_edges" USING btree ("graph_id","target_node_id");--> statement-breakpoint
CREATE UNIQUE INDEX "graph_edges_no_duplicates" ON "graph_edges" USING btree ("graph_id","kind","source_node_id","target_node_id",coalesce("target_variable_id", ''),coalesce("cue_id", ''),coalesce("action_id", ''));--> statement-breakpoint
CREATE INDEX "graph_nodes_parent_idx" ON "graph_nodes" USING btree ("graph_id","parent_id");