-- Retire the old customer table (phase 3 step 3, owner decision 2026-11-03):
-- tasks and activities lose their customer links and stay; their order links
-- were copied to subject_type/subject_id by 0015. Destructive.
ALTER TABLE "activity" DROP CONSTRAINT "activity_customer_id_customer_id_fk";--> statement-breakpoint
ALTER TABLE "activity" DROP CONSTRAINT "activity_order_id_sales_order_id_fk";--> statement-breakpoint
ALTER TABLE "task" DROP CONSTRAINT "task_customer_id_customer_id_fk";--> statement-breakpoint
ALTER TABLE "task" DROP CONSTRAINT "task_order_id_sales_order_id_fk";--> statement-breakpoint
DROP INDEX "activity_workspace_customer_idx";--> statement-breakpoint
ALTER TABLE "activity" DROP COLUMN "customer_id";--> statement-breakpoint
ALTER TABLE "activity" DROP COLUMN "order_id";--> statement-breakpoint
ALTER TABLE "task" DROP COLUMN "customer_id";--> statement-breakpoint
ALTER TABLE "task" DROP COLUMN "order_id";--> statement-breakpoint
DROP TABLE "customer";
