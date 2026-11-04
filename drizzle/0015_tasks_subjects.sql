ALTER TABLE "activity" ADD COLUMN "subject_type" text;--> statement-breakpoint
ALTER TABLE "activity" ADD COLUMN "subject_id" text;--> statement-breakpoint
ALTER TABLE "activity" ADD COLUMN "project_id" text;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "subject_type" text;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "subject_id" text;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "project_id" text;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "is_milestone" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_workspace_subject_idx" ON "activity" USING btree ("workspace_id","subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "activity_workspace_project_idx" ON "activity" USING btree ("workspace_id","project_id");--> statement-breakpoint
CREATE INDEX "task_workspace_subject_idx" ON "task" USING btree ("workspace_id","subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "task_workspace_project_idx" ON "task" USING btree ("workspace_id","project_id");--> statement-breakpoint
-- Keep the old order links as the record each task or activity is about
UPDATE "task" SET "subject_type" = 'order', "subject_id" = "order_id" WHERE "order_id" IS NOT NULL;--> statement-breakpoint
UPDATE "activity" SET "subject_type" = 'order', "subject_id" = "order_id" WHERE "order_id" IS NOT NULL;
