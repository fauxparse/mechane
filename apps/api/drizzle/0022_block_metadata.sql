ALTER TABLE "blocks" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;
