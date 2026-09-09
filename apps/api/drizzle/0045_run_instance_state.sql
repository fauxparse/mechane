ALTER TABLE "run_device_states" ADD COLUMN "instance_source_values" jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "run_device_states" ADD COLUMN "instance_structured_values" jsonb NOT NULL DEFAULT '{}'::jsonb;
