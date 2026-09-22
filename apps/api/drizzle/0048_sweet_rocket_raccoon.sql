CREATE TABLE "run_device_transformer_seeds" (
	"run_id" text NOT NULL,
	"device_id" text NOT NULL,
	"transformer_id" text NOT NULL,
	"seed" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "run_device_transformer_seeds_run_id_device_id_transformer_id_pk" PRIMARY KEY("run_id","device_id","transformer_id")
);
--> statement-breakpoint
CREATE TABLE "run_transformer_seeds" (
	"run_id" text NOT NULL,
	"transformer_id" text NOT NULL,
	"seed" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "run_transformer_seeds_run_id_transformer_id_pk" PRIMARY KEY("run_id","transformer_id")
);
--> statement-breakpoint
ALTER TABLE "run_errors" ADD COLUMN "transformer_id" text;--> statement-breakpoint
ALTER TABLE "run_device_transformer_seeds" ADD CONSTRAINT "run_device_transformer_seeds_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_transformer_seeds" ADD CONSTRAINT "run_transformer_seeds_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;