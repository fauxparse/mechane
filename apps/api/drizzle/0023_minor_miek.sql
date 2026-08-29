ALTER TABLE "image_assets" ADD COLUMN "name" text DEFAULT '' NOT NULL;
UPDATE "image_assets" SET "name" = "alt" WHERE "name" = '';