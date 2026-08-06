ALTER TABLE "devices" DROP CONSTRAINT "devices_pairing_code_is_six_digits";--> statement-breakpoint
-- Codes changed shape (#45): six digits became five characters from an
-- alphabet with no look-alikes, so every existing code violates the
-- constraint added below. They are dropped rather than rewritten because
-- this predates any real Show — the seed remints them, and a Device node
-- whose row has gone simply reads as "no code yet" until the next save.
-- A migration written after Shows exist would have to rewrite in place.
DELETE FROM "devices";--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_pairing_code_is_unambiguous" CHECK ("devices"."pairing_code" ~ '^[1-9A-HJKMNP-Z]{5}$');
