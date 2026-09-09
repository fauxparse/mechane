ALTER TABLE "graph_event_bindings" ADD COLUMN "parameter_mappings" jsonb NOT NULL DEFAULT '[]'::jsonb;
