ALTER TABLE "graph_event_bindings" ADD COLUMN "params" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "player_events" ADD COLUMN "params" jsonb;