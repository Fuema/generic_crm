CREATE TABLE "company" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"domain" text,
	"phone" text,
	"city" text,
	"country" text,
	"owner_id" text,
	"custom" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"archived_at" timestamp,
	"created_by_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text,
	"email" text,
	"phone" text,
	"job_title" text,
	"company_id" text,
	"lifecycle_stage" text DEFAULT 'lead' NOT NULL,
	"owner_id" text,
	"locale" text,
	"email_consent" text DEFAULT 'unknown' NOT NULL,
	"email_consent_source" text,
	"email_consent_at" timestamp,
	"custom" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"archived_at" timestamp,
	"created_by_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"type" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company" ADD CONSTRAINT "company_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company" ADD CONSTRAINT "company_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company" ADD CONSTRAINT "company_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "company_workspace_domain_unique" ON "company" USING btree ("workspace_id",lower("domain")) WHERE "company"."domain" is not null;--> statement-breakpoint
CREATE INDEX "company_workspace_name_idx" ON "company" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_workspace_email_unique" ON "contact" USING btree ("workspace_id",lower("email")) WHERE "contact"."email" is not null;--> statement-breakpoint
CREATE INDEX "contact_workspace_created_idx" ON "contact" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "contact_workspace_stage_idx" ON "contact" USING btree ("workspace_id","lifecycle_stage");--> statement-breakpoint
CREATE INDEX "contact_workspace_company_idx" ON "contact" USING btree ("workspace_id","company_id");--> statement-breakpoint
CREATE INDEX "contact_custom_gin_idx" ON "contact" USING gin ("custom");--> statement-breakpoint
CREATE INDEX "event_workspace_subject_idx" ON "event" USING btree ("workspace_id","subject_type","subject_id","created_at");--> statement-breakpoint
CREATE INDEX "event_workspace_created_idx" ON "event" USING btree ("workspace_id","created_at");