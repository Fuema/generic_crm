ALTER TABLE "project" ADD COLUMN "status" text DEFAULT 'planned' NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "start_date" timestamp;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "due_date" timestamp;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "owner_id" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "contact_id" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "company_id" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "deal_id" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "custom" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_workspace_status_idx" ON "project" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "project_workspace_contact_idx" ON "project" USING btree ("workspace_id","contact_id");--> statement-breakpoint
CREATE INDEX "project_workspace_deal_idx" ON "project" USING btree ("workspace_id","deal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_workspace_deal_active_unique" ON "project" USING btree ("workspace_id","deal_id") WHERE "project"."deal_id" is not null and "project"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "project_custom_gin_idx" ON "project" USING gin ("custom");