ALTER TABLE "quote" ADD COLUMN "decided_via" text;--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "decided_by_contact_id" text;--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "accepted_name" text;--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "decided_ip" text;--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "decided_user_agent" text;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_decided_by_contact_id_contact_id_fk" FOREIGN KEY ("decided_by_contact_id") REFERENCES "public"."contact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Quotes decided before the portal were decided by staff
UPDATE "quote" SET "decided_via" = 'staff' WHERE "status" IN ('accepted', 'declined');
