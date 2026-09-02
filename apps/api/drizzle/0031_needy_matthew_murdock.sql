ALTER TABLE "graph_cues" ALTER COLUMN "scene_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "graph_cues" ADD COLUMN "block_id" text;--> statement-breakpoint
ALTER TABLE "graph_cues" ADD CONSTRAINT "graph_cues_block_fk" FOREIGN KEY ("graph_id","block_id") REFERENCES "public"."blocks"("graph_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_cues" ADD CONSTRAINT "graph_cues_block_name_unique" UNIQUE("graph_id","block_id","name");--> statement-breakpoint
ALTER TABLE "graph_cues" ADD CONSTRAINT "graph_cues_exactly_one_owner" CHECK (("graph_cues"."scene_id" is not null) <> ("graph_cues"."block_id" is not null));