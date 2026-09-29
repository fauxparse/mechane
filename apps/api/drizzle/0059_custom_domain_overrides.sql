CREATE TABLE "custom_domain_overrides" (
	"hostname" text PRIMARY KEY NOT NULL,
	"withhold_proof" boolean DEFAULT false NOT NULL,
	"keep_proof_for_email" text,
	"misconfigured" boolean DEFAULT false NOT NULL,
	"fail_https" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
