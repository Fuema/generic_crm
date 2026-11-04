ALTER TABLE "invoice" DROP CONSTRAINT "invoice_customer_id_customer_id_fk";
--> statement-breakpoint
ALTER TABLE "sales_order" DROP CONSTRAINT "sales_order_customer_id_customer_id_fk";
--> statement-breakpoint
ALTER TABLE "invoice" DROP COLUMN "customer_id";--> statement-breakpoint
ALTER TABLE "sales_order" DROP COLUMN "customer_id";