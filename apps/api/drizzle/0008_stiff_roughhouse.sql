CREATE TABLE "source_field_defaults" (
	"graph_id" text NOT NULL,
	"node_id" text NOT NULL,
	"field_path" text[] NOT NULL,
	"value" jsonb,
	CONSTRAINT "source_field_defaults_graph_id_node_id_field_path_pk" PRIMARY KEY("graph_id","node_id","field_path")
);
--> statement-breakpoint
ALTER TABLE "graph_node_variables" ADD COLUMN "type" jsonb;--> statement-breakpoint
ALTER TABLE "graph_nodes" ADD COLUMN "type" jsonb;--> statement-breakpoint
ALTER TABLE "source_field_defaults" ADD CONSTRAINT "source_field_defaults_graph_id_show_graphs_id_fk" FOREIGN KEY ("graph_id") REFERENCES "public"."show_graphs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_field_defaults" ADD CONSTRAINT "source_field_defaults_node_fk" FOREIGN KEY ("graph_id","node_id") REFERENCES "public"."graph_nodes"("graph_id","id") ON DELETE cascade ON UPDATE no action;