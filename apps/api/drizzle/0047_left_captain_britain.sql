CREATE TABLE "graph_transformers" (
	"graph_id" text NOT NULL,
	"node_id" text NOT NULL,
	"kind" text NOT NULL,
	"formula" text,
	"output_type" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "graph_transformers_graph_id_node_id_pk" PRIMARY KEY("graph_id","node_id"),
	CONSTRAINT "graph_transformers_configuration" CHECK (("graph_transformers"."kind" = 'calculate') or ("graph_transformers"."kind" = 'filter' and "graph_transformers"."formula" is not null and "graph_transformers"."output_type" is null) or ("graph_transformers"."kind" = 'shuffle' and "graph_transformers"."formula" is null and "graph_transformers"."output_type" is null))
);
--> statement-breakpoint
INSERT INTO "graph_transformers" ("graph_id", "node_id", "kind", "formula", "output_type")
SELECT "graph_id", "id", 'calculate', NULL, "type"
FROM "graph_nodes"
WHERE "kind" = 'transformer';--> statement-breakpoint
ALTER TABLE "graph_node_variables" RENAME TO "graph_node_ports";--> statement-breakpoint
ALTER TABLE "graph_edges" RENAME COLUMN "target_variable_id" TO "target_port_id";--> statement-breakpoint
ALTER TABLE "graph_node_ports" RENAME COLUMN "scene_id" TO "node_id";--> statement-breakpoint
ALTER TABLE "graph_node_ports" DROP CONSTRAINT "graph_node_variables_scene_name_unique";--> statement-breakpoint
ALTER TABLE "graph_edges" DROP CONSTRAINT "graph_edges_target_variable_fk";
--> statement-breakpoint
ALTER TABLE "graph_node_ports" DROP CONSTRAINT "graph_node_variables_graph_id_show_graphs_id_fk";
--> statement-breakpoint
ALTER TABLE "graph_node_ports" DROP CONSTRAINT "graph_node_variables_scene_fk";
--> statement-breakpoint
ALTER TABLE "graph_node_ports" DROP CONSTRAINT "graph_node_variables_graph_id_id_pk";--> statement-breakpoint
ALTER TABLE "graph_node_ports" ADD CONSTRAINT "graph_node_ports_graph_id_id_pk" PRIMARY KEY("graph_id","id");--> statement-breakpoint
ALTER TABLE "graph_transformers" ADD CONSTRAINT "graph_transformers_graph_id_show_graphs_id_fk" FOREIGN KEY ("graph_id") REFERENCES "public"."show_graphs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_transformers" ADD CONSTRAINT "graph_transformers_node_fk" FOREIGN KEY ("graph_id","node_id") REFERENCES "public"."graph_nodes"("graph_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_edges" ADD CONSTRAINT "graph_edges_target_port_fk" FOREIGN KEY ("graph_id","target_port_id") REFERENCES "public"."graph_node_ports"("graph_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_node_ports" ADD CONSTRAINT "graph_node_ports_graph_id_show_graphs_id_fk" FOREIGN KEY ("graph_id") REFERENCES "public"."show_graphs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_node_ports" ADD CONSTRAINT "graph_node_ports_node_fk" FOREIGN KEY ("graph_id","node_id") REFERENCES "public"."graph_nodes"("graph_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_node_ports" ADD CONSTRAINT "graph_node_ports_node_name_unique" UNIQUE("graph_id","node_id","name");
UPDATE "graph_nodes" SET "type" = NULL WHERE "kind" = 'transformer';--> statement-breakpoint