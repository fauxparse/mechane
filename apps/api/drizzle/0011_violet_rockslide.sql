CREATE TABLE "blocks" (
	"id" text NOT NULL,
	"graph_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "blocks_graph_id_id_pk" PRIMARY KEY("graph_id","id"),
	CONSTRAINT "blocks_graph_name_unique" UNIQUE("graph_id","name")
);
--> statement-breakpoint
CREATE TABLE "canvas_elements" (
	"id" text NOT NULL,
	"canvas_id" text NOT NULL,
	"parent_id" text,
	"type" text NOT NULL,
	"rank" text NOT NULL,
	"name" text,
	"hidden" boolean DEFAULT false NOT NULL,
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "canvas_elements_canvas_id_id_pk" PRIMARY KEY("canvas_id","id")
);
--> statement-breakpoint
CREATE TABLE "canvases" (
	"id" text PRIMARY KEY NOT NULL,
	"graph_id" text NOT NULL,
	"scene_node_id" text,
	"block_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "canvases_exactly_one_owner" CHECK (("canvases"."scene_node_id" is not null) <> ("canvases"."block_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_graph_id_show_graphs_id_fk" FOREIGN KEY ("graph_id") REFERENCES "public"."show_graphs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canvas_elements" ADD CONSTRAINT "canvas_elements_canvas_id_canvases_id_fk" FOREIGN KEY ("canvas_id") REFERENCES "public"."canvases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canvas_elements" ADD CONSTRAINT "canvas_elements_parent_fk" FOREIGN KEY ("canvas_id","parent_id") REFERENCES "public"."canvas_elements"("canvas_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canvases" ADD CONSTRAINT "canvases_graph_id_show_graphs_id_fk" FOREIGN KEY ("graph_id") REFERENCES "public"."show_graphs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canvases" ADD CONSTRAINT "canvases_scene_owner_fk" FOREIGN KEY ("graph_id","scene_node_id") REFERENCES "public"."graph_nodes"("graph_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canvases" ADD CONSTRAINT "canvases_block_owner_fk" FOREIGN KEY ("graph_id","block_id") REFERENCES "public"."blocks"("graph_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "canvas_elements_parent_idx" ON "canvas_elements" USING btree ("canvas_id","parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "canvas_elements_root_unique" ON "canvas_elements" USING btree ("canvas_id") WHERE "canvas_elements"."parent_id" is null;--> statement-breakpoint
CREATE INDEX "canvases_graph_idx" ON "canvases" USING btree ("graph_id");--> statement-breakpoint
CREATE UNIQUE INDEX "canvases_scene_owner_unique" ON "canvases" USING btree ("graph_id","scene_node_id");--> statement-breakpoint
CREATE UNIQUE INDEX "canvases_block_owner_unique" ON "canvases" USING btree ("graph_id","block_id");