-- Owner decision (spec §3): the old demo orders and invoices, which belong to
-- the old customer model, are deleted. Tasks and activities that pointed to an
-- order keep the task and lose only that link (ON DELETE SET NULL).
DELETE FROM "invoice_line";--> statement-breakpoint
DELETE FROM "invoice";--> statement-breakpoint
DELETE FROM "order_line";--> statement-breakpoint
DELETE FROM "sales_order";--> statement-breakpoint
ALTER TABLE "invoice" DROP CONSTRAINT "invoice_order_id_unique";--> statement-breakpoint
DROP INDEX "sales_order_customer_idx";--> statement-breakpoint
DROP INDEX "invoice_line_invoice_idx";--> statement-breakpoint
DROP INDEX "order_line_order_idx";--> statement-breakpoint
ALTER TABLE "invoice" ALTER COLUMN "order_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "contact_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "company_id" text;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "deal_id" text;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "owner_id" text;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "locale" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "custom" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "invoice_line" ADD COLUMN "workspace_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_line" ADD COLUMN "product_id" text;--> statement-breakpoint
ALTER TABLE "order_line" ADD COLUMN "workspace_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_order" ADD COLUMN "contact_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_order" ADD COLUMN "company_id" text;--> statement-breakpoint
ALTER TABLE "sales_order" ADD COLUMN "deal_id" text;--> statement-breakpoint
ALTER TABLE "sales_order" ADD COLUMN "quote_id" text;--> statement-breakpoint
ALTER TABLE "sales_order" ADD COLUMN "owner_id" text;--> statement-breakpoint
ALTER TABLE "sales_order" ADD COLUMN "locale" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_order" ADD COLUMN "custom" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_order" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line" ADD CONSTRAINT "invoice_line_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line" ADD CONSTRAINT "invoice_line_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line" ADD CONSTRAINT "order_line_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order" ADD CONSTRAINT "sales_order_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order" ADD CONSTRAINT "sales_order_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order" ADD CONSTRAINT "sales_order_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order" ADD CONSTRAINT "sales_order_quote_id_quote_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quote"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_order" ADD CONSTRAINT "sales_order_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_workspace_order_unique" ON "invoice" USING btree ("workspace_id","order_id") WHERE "invoice"."order_id" is not null and "invoice"."status" <> 'void';--> statement-breakpoint
CREATE INDEX "invoice_workspace_contact_idx" ON "invoice" USING btree ("workspace_id","contact_id");--> statement-breakpoint
CREATE INDEX "invoice_custom_gin_idx" ON "invoice" USING gin ("custom");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_order_workspace_quote_unique" ON "sales_order" USING btree ("workspace_id","quote_id") WHERE "sales_order"."quote_id" is not null;--> statement-breakpoint
CREATE INDEX "sales_order_workspace_contact_idx" ON "sales_order" USING btree ("workspace_id","contact_id");--> statement-breakpoint
CREATE INDEX "sales_order_workspace_deal_idx" ON "sales_order" USING btree ("workspace_id","deal_id");--> statement-breakpoint
CREATE INDEX "sales_order_custom_gin_idx" ON "sales_order" USING gin ("custom");--> statement-breakpoint
CREATE INDEX "invoice_line_invoice_idx" ON "invoice_line" USING btree ("workspace_id","invoice_id","position");--> statement-breakpoint
CREATE INDEX "order_line_order_idx" ON "order_line" USING btree ("workspace_id","order_id","position");