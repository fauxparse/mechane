CREATE TABLE "shape_field_refs" (
	"graph_id" text NOT NULL,
	"field_id" text NOT NULL,
	"referenced_shape_id" text NOT NULL,
	CONSTRAINT "shape_field_refs_graph_id_field_id_referenced_shape_id_pk" PRIMARY KEY("graph_id","field_id","referenced_shape_id")
);
--> statement-breakpoint
CREATE TABLE "shape_fields" (
	"id" text NOT NULL,
	"graph_id" text NOT NULL,
	"shape_id" text NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"type" jsonb NOT NULL,
	"required" boolean NOT NULL,
	"default_value" jsonb,
	CONSTRAINT "shape_fields_graph_id_id_pk" PRIMARY KEY("graph_id","id"),
	CONSTRAINT "shape_fields_graph_shape_name_unique" UNIQUE("graph_id","shape_id","name")
);
--> statement-breakpoint
CREATE TABLE "shapes" (
	"id" text NOT NULL,
	"graph_id" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "shapes_graph_id_id_pk" PRIMARY KEY("graph_id","id"),
	CONSTRAINT "shapes_graph_name_unique" UNIQUE("graph_id","name")
);
--> statement-breakpoint
ALTER TABLE "shape_field_refs" ADD CONSTRAINT "shape_field_refs_graph_id_show_graphs_id_fk" FOREIGN KEY ("graph_id") REFERENCES "public"."show_graphs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shape_field_refs" ADD CONSTRAINT "shape_field_refs_field_fk" FOREIGN KEY ("graph_id","field_id") REFERENCES "public"."shape_fields"("graph_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shape_field_refs" ADD CONSTRAINT "shape_field_refs_shape_fk" FOREIGN KEY ("graph_id","referenced_shape_id") REFERENCES "public"."shapes"("graph_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shape_fields" ADD CONSTRAINT "shape_fields_graph_id_show_graphs_id_fk" FOREIGN KEY ("graph_id") REFERENCES "public"."show_graphs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shape_fields" ADD CONSTRAINT "shape_fields_shape_fk" FOREIGN KEY ("graph_id","shape_id") REFERENCES "public"."shapes"("graph_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shapes" ADD CONSTRAINT "shapes_graph_id_show_graphs_id_fk" FOREIGN KEY ("graph_id") REFERENCES "public"."show_graphs"("id") ON DELETE cascade ON UPDATE no action;