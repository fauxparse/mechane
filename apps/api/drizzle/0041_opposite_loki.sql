ALTER TABLE "player_events" ADD COLUMN "changed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "player_events" ADD COLUMN "failing_action_id" text;