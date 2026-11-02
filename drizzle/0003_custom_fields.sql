CREATE TABLE "field_definition" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"object_key" text NOT NULL,
	"key" text NOT NULL,
	"label" jsonb NOT NULL,
	"help" jsonb,
	"type" text NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"unique" boolean DEFAULT false NOT NULL,
	"group_id" text,
	"position" integer DEFAULT 0 NOT NULL,
	"portal_visibility" text DEFAULT 'hidden' NOT NULL,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "field_group" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"object_key" text NOT NULL,
	"label" jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "field_definition" ADD CONSTRAINT "field_definition_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_definition" ADD CONSTRAINT "field_definition_group_id_field_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."field_group"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_group" ADD CONSTRAINT "field_group_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "field_definition_key_unique" ON "field_definition" USING btree ("workspace_id","object_key","key");--> statement-breakpoint
CREATE INDEX "field_definition_object_idx" ON "field_definition" USING btree ("workspace_id","object_key","position");--> statement-breakpoint
CREATE INDEX "field_group_object_idx" ON "field_group" USING btree ("workspace_id","object_key","position");