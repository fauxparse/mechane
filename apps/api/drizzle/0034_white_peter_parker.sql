ALTER TABLE "graph_event_bindings" ADD COLUMN IF NOT EXISTS "params" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "player_events" ADD COLUMN IF NOT EXISTS "params" jsonb;--> statement-breakpoint
ALTER TABLE "graph_nodes" ADD COLUMN IF NOT EXISTS "size" jsonb;