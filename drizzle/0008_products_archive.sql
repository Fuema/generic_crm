ALTER TABLE "product" ADD COLUMN "custom" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
-- Products marked inactive before this migration start out archived
UPDATE "product" SET "archived_at" = "updated_at" WHERE "active" = false;
