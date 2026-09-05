ALTER TABLE "graph_actions" ALTER COLUMN "target_scene_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "graph_actions" ADD COLUMN "target_source_id" text;--> statement-breakpoint
ALTER TABLE "graph_actions" ADD COLUMN "params" jsonb;--> statement-breakpoint
ALTER TABLE "graph_actions" ADD CONSTRAINT "graph_actions_target_source_fk" FOREIGN KEY ("graph_id","target_source_id") REFERENCES "public"."graph_nodes"("graph_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_actions" ADD CONSTRAINT "graph_actions_target_by_kind" CHECK (("graph_actions"."kind" = 'navigate' and "graph_actions"."target_scene_id" is not null and "graph_actions"."target_source_id" is null)
        or ("graph_actions"."kind" = 'update' and "graph_actions"."target_scene_id" is null and "graph_actions"."target_source_id" is not null));