CREATE TABLE "payment" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"invoice_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"paid_on" timestamp NOT NULL,
	"method" text NOT NULL,
	"reference" text,
	"note" text,
	"status" text DEFAULT 'reported' NOT NULL,
	"source" text DEFAULT 'staff' NOT NULL,
	"recorded_by_id" text,
	"decided_by_id" text,
	"decided_at" timestamp,
	"reject_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoice" DROP CONSTRAINT "invoice_order_id_sales_order_id_fk";
--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "paid_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_recorded_by_id_user_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_decided_by_id_user_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_invoice_idx" ON "payment" USING btree ("workspace_id","invoice_id","paid_on");--> statement-breakpoint
CREATE INDEX "payment_workspace_status_idx" ON "payment" USING btree ("workspace_id","status");--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_order_id_sales_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."sales_order"("id") ON DELETE no action ON UPDATE no action;