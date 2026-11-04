CREATE TABLE "portal_link_request" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text,
	"email_hash" text NOT NULL,
	"ip" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "portal_access" ADD COLUMN "company_id" text;--> statement-breakpoint
ALTER TABLE "portal_link_request" ADD CONSTRAINT "portal_link_request_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "portal_link_request_email_idx" ON "portal_link_request" USING btree ("email_hash","created_at");--> statement-breakpoint
CREATE INDEX "portal_link_request_ip_idx" ON "portal_link_request" USING btree ("ip","created_at");--> statement-breakpoint
ALTER TABLE "portal_access" ADD CONSTRAINT "portal_access_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE set null ON UPDATE no action;