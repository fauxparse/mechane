ALTER TABLE "devices" DROP CONSTRAINT "devices_pairing_code_unique";--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_pairing_code_unique" UNIQUE("pairing_code");