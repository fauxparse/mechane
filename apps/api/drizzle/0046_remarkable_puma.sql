ALTER TABLE "graph_event_bindings" ADD COLUMN IF NOT EXISTS "parameter_mappings" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "graph_nodes" ADD COLUMN IF NOT EXISTS "editor_metadata" jsonb;--> statement-breakpoint
ALTER TABLE "run_device_states" ADD COLUMN IF NOT EXISTS "instance_source_values" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "run_device_states" ADD COLUMN IF NOT EXISTS "instance_structured_values" jsonb DEFAULT '{}'::jsonb NOT NULL;