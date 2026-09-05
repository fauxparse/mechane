DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM "runs" WHERE "status" = 'active') THEN
		RAISE EXCEPTION 'Cannot migrate live Run state while an active Run exists; end active Runs first.';
	END IF;
END
$$;
--> statement-breakpoint
CREATE TABLE "run_source_values" (
	"run_id" text NOT NULL,
	"source_id" text NOT NULL,
	"value" jsonb NOT NULL,
	CONSTRAINT "run_source_values_run_id_source_id_pk" PRIMARY KEY("run_id","source_id")
);
--> statement-breakpoint
CREATE TABLE "run_structured_values" (
	"run_id" text NOT NULL,
	"structured_value_id" text NOT NULL,
	"kind" text NOT NULL,
	"type" jsonb NOT NULL,
	"payload" jsonb NOT NULL,
	CONSTRAINT "run_structured_values_run_id_structured_value_id_pk" PRIMARY KEY("run_id","structured_value_id"),
	CONSTRAINT "run_structured_values_kind" CHECK ("run_structured_values"."kind" in ('shape', 'array'))
);
--> statement-breakpoint
ALTER TABLE "shows" ADD COLUMN "state_sequence" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "run_source_values" ADD CONSTRAINT "run_source_values_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_structured_values" ADD CONSTRAINT "run_structured_values_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" DROP COLUMN "source_values";