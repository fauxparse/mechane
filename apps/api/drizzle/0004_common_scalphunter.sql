CREATE TABLE "devices" (
	"id" text NOT NULL,
	"show_id" text NOT NULL,
	"pairing_code" text NOT NULL,
	"per_connection" boolean DEFAULT false NOT NULL,
	"retired_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "devices_show_id_id_pk" PRIMARY KEY("show_id","id"),
	CONSTRAINT "devices_pairing_code_unique" UNIQUE("show_id","pairing_code"),
	CONSTRAINT "devices_pairing_code_is_six_digits" CHECK ("devices"."pairing_code" ~ '^[0-9]{6}$')
);
--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_show_id_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE cascade ON UPDATE no action;