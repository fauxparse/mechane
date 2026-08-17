CREATE TABLE "blob_upload_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"show_id" text NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"candidate_digest" text,
	"byte_length" integer,
	"declared_mime_type" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blobs" (
	"digest" text PRIMARY KEY NOT NULL,
	"byte_length" integer NOT NULL,
	"mime_type" text NOT NULL,
	"delivery_path" text NOT NULL,
	"state" text DEFAULT 'committed' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "blobs_delivery_path_unique" UNIQUE("delivery_path")
);
--> statement-breakpoint
CREATE TABLE "image_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"show_id" text NOT NULL,
	"blob_digest" text NOT NULL,
	"revision" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"mime_type" text NOT NULL,
	"alt" text DEFAULT '' NOT NULL,
	"blur_hash" text,
	"state" text DEFAULT 'active' NOT NULL,
	"source_asset_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "image_assets_show_id_unique" UNIQUE("show_id","id")
);
--> statement-breakpoint
ALTER TABLE "graph_node_variables" ADD COLUMN "suggested_dimensions" jsonb;--> statement-breakpoint
ALTER TABLE "blob_upload_sessions" ADD CONSTRAINT "blob_upload_sessions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blob_upload_sessions" ADD CONSTRAINT "blob_upload_sessions_show_id_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image_assets" ADD CONSTRAINT "image_assets_show_id_shows_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."shows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image_assets" ADD CONSTRAINT "image_assets_blob_digest_blobs_digest_fk" FOREIGN KEY ("blob_digest") REFERENCES "public"."blobs"("digest") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image_assets" ADD CONSTRAINT "image_assets_source_fk" FOREIGN KEY ("show_id","source_asset_id") REFERENCES "public"."image_assets"("show_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blob_upload_sessions_user_show_idx" ON "blob_upload_sessions" USING btree ("user_id","show_id");--> statement-breakpoint
CREATE INDEX "image_assets_show_idx" ON "image_assets" USING btree ("show_id");--> statement-breakpoint
CREATE UNIQUE INDEX "image_assets_show_blob_active_idx" ON "image_assets" USING btree ("show_id","blob_digest") WHERE "image_assets"."state" = 'active';