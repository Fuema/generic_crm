CREATE TABLE "deal" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"pipeline_id" text NOT NULL,
	"stage_id" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"value_cents" integer DEFAULT 0 NOT NULL,
	"expected_close_at" timestamp,
	"contact_id" text NOT NULL,
	"company_id" text,
	"owner_id" text,
	"lost_reason" text,
	"closed_at" timestamp,
	"custom" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_pipeline_id_pipeline_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipeline"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_stage_id_pipeline_stage_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."pipeline_stage"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deal_workspace_stage_idx" ON "deal" USING btree ("workspace_id","pipeline_id","stage_id");--> statement-breakpoint
CREATE INDEX "deal_workspace_status_idx" ON "deal" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "deal_workspace_contact_idx" ON "deal" USING btree ("workspace_id","contact_id");--> statement-breakpoint
CREATE INDEX "deal_workspace_company_idx" ON "deal" USING btree ("workspace_id","company_id");--> statement-breakpoint
CREATE INDEX "deal_workspace_created_idx" ON "deal" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "deal_custom_gin_idx" ON "deal" USING gin ("custom");