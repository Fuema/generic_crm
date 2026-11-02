// Seeds demo products, orders and invoices into one workspace, for testing.
// Every seeded row is tagged "[demo]" in its description/notes so --clear can
// remove exactly those rows.
//
//   bun run db:seed:sales --email you@example.com --workspace "Name"
//   bun run db:seed:sales --email you@example.com --workspace "Name" --clear
import { faker } from "@faker-js/faker";
import { and, eq, like, ne, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { db } from "../src/db/index";
import {
	customer,
	invoice,
	invoiceLine,
	member,
	organization,
	orderLine,
	product,
	salesOrder,
	workspaceCounter,
	user,
} from "../src/db/schema";
import { computeTotals } from "../src/lib/money";

const TAG = "[demo]";
const DAY = 24 * 60 * 60 * 1000;
const TAX_RATE_BP = 825;
const CURRENCY = "USD";

function arg(name: string) {
	const i = process.argv.indexOf(`--${name}`);
	return i === -1 ? undefined : (process.argv[i + 1] ?? "");
}

const email = arg("email")?.trim().toLowerCase();
const workspaceName = arg("workspace")?.trim();
const clear = process.argv.includes("--clear");
if (!email || !workspaceName) {
	console.error('Usage: bun run db:seed:sales --email you@example.com --workspace "Name" [--clear]');
	process.exit(1);
}

const [owner] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
if (!owner) {
	console.error(`No user with email ${email}`);
	process.exit(1);
}
const [workspace] = await db
	.select({ id: organization.id, name: organization.name })
	.from(member)
	.innerJoin(organization, eq(organization.id, member.organizationId))
	.where(and(eq(member.userId, owner.id), eq(organization.name, workspaceName)))
	.limit(1);
if (!workspace) {
	console.error(`${email} isn't a member of a workspace named "${workspaceName}"`);
	process.exit(1);
}
const workspaceId = workspace.id;

if (clear) {
	// Invoices first (they block order deletion), then orders, then products
	const invoices = await db
		.delete(invoice)
		.where(and(eq(invoice.workspaceId, workspaceId), like(invoice.notes, `${TAG}%`)))
		.returning({ id: invoice.id });
	const orders = await db
		.delete(salesOrder)
		.where(and(eq(salesOrder.workspaceId, workspaceId), like(salesOrder.notes, `${TAG}%`)))
		.returning({ id: salesOrder.id });
	const products = await db
		.delete(product)
		.where(and(eq(product.workspaceId, workspaceId), like(product.description, `${TAG}%`)))
		.returning({ id: product.id });
	console.log(
		`Removed ${invoices.length} invoices, ${orders.length} orders and ${products.length} products from "${workspace.name}".`,
	);
	process.exit(0);
}

async function nextNumber(kind: "order" | "invoice", year = 0) {
	const [row] = await db
		.insert(workspaceCounter)
		.values({ workspaceId, kind, year, value: 1 })
		.onConflictDoUpdate({
			target: [workspaceCounter.workspaceId, workspaceCounter.kind, workspaceCounter.year],
			set: { value: sql`${workspaceCounter.value} + 1` },
		})
		.returning({ value: workspaceCounter.value });
	return row.value;
}

// Different but repeatable data per workspace
faker.seed([...workspaceId].reduce((sum, c) => sum + c.charCodeAt(0), 7));

// --- Products ---------------------------------------------------------------
const existing = await db
	.select({ id: product.id })
	.from(product)
	.where(and(eq(product.workspaceId, workspaceId), like(product.description, `${TAG}%`)))
	.limit(1);
if (existing.length) {
	console.error(`"${workspace.name}" already has demo sales data. Run with --clear first.`);
	process.exit(1);
}

const productRows = Array.from({ length: 15 }, (_, i) => ({
	id: crypto.randomUUID(),
	workspaceId,
	name: faker.commerce.productName(),
	sku: `DEMO-${String(i + 1).padStart(3, "0")}`,
	description: `${TAG} ${faker.commerce.productDescription().slice(0, 120)}`,
	unitPriceCents: faker.number.int({ min: 5, max: 400 }) * 100 + faker.helpers.arrayElement([0, 50, 99]),
	active: i < 13, // two inactive products to show the filter
}));
await db.insert(product).values(productRows).onConflictDoNothing();
const activeProducts = productRows.filter((p) => p.active);

// --- Orders and invoices ----------------------------------------------------
const customers = await db
	.select({ id: customer.id })
	.from(customer)
	.where(and(eq(customer.workspaceId, workspaceId), ne(customer.status, "inactive")))
	.limit(200);
if (!customers.length) {
	console.log(`Added ${productRows.length} products. No customers in "${workspace.name}", so no orders were created.`);
	process.exit(0);
}

// 3 drafts, 3 confirmed, 4 fulfilled; invoices on the confirmed/fulfilled ones
const plan = [
	{ status: "draft" },
	{ status: "draft" },
	{ status: "draft" },
	{ status: "confirmed" },
	{ status: "confirmed", invoice: "draft" },
	{ status: "confirmed", invoice: "issued" },
	{ status: "fulfilled", invoice: "paid" },
	{ status: "fulfilled", invoice: "paid" },
	{ status: "fulfilled", invoice: "overdue" },
	{ status: "fulfilled" },
] as const;

let orders = 0;
let invoices = 0;
for (const [i, step] of plan.entries()) {
	const picked = faker.helpers.arrayElements(activeProducts, { min: 1, max: 4 });
	const lines = picked.map((p, position) => ({
		position,
		productId: p.id,
		description: p.name,
		sku: p.sku,
		quantity: faker.number.int({ min: 1, max: 5 }),
		unitPriceCents: p.unitPriceCents,
	}));
	const totals = computeTotals(lines, TAX_RATE_BP);
	// Older orders first, spread over the last 90 days
	const orderDate = new Date(Date.now() - (90 - i * 8) * DAY);
	const orderId = crypto.randomUUID();
	// The invoice must bill the same customer as its order
	const customerId = faker.helpers.arrayElement(customers).id;
	const statements: BatchItem<"pg">[] = [
		db.insert(salesOrder).values({
			id: orderId,
			workspaceId,
			number: await nextNumber("order"),
			customerId,
			status: step.status,
			orderDate,
			currency: CURRENCY,
			taxRateBp: TAX_RATE_BP,
			subtotalCents: totals.subtotalCents,
			taxCents: totals.taxCents,
			totalCents: totals.totalCents,
			notes: `${TAG} Demo order`,
			createdById: owner.id,
			createdAt: orderDate,
			updatedAt: orderDate,
		}),
		db.insert(orderLine).values(
			lines.map((l, n) => ({ id: crypto.randomUUID(), orderId, ...l, lineTotalCents: totals.lineTotals[n] })),
		),
	];
	orders++;

	if ("invoice" in step) {
		const invoiceId = crypto.randomUUID();
		const issued = step.invoice !== "draft";
		// The overdue one was issued 45 days ago with 30-day terms
		const issueDate = issued ? new Date(orderDate.getTime() + (step.invoice === "overdue" ? 0 : 2) * DAY) : null;
		const year = issueDate?.getUTCFullYear() ?? null;
		statements.push(
			db.insert(invoice).values({
				id: invoiceId,
				workspaceId,
				orderId,
				customerId,
				year,
				number: issued && year ? await nextNumber("invoice", year) : null,
				status: step.invoice === "overdue" ? "issued" : step.invoice,
				issueDate,
				dueDate: issueDate ? new Date(issueDate.getTime() + 30 * DAY) : null,
				paidAt: step.invoice === "paid" && issueDate ? new Date(issueDate.getTime() + 10 * DAY) : null,
				currency: CURRENCY,
				taxRateBp: TAX_RATE_BP,
				subtotalCents: totals.subtotalCents,
				taxCents: totals.taxCents,
				totalCents: totals.totalCents,
				notes: `${TAG} Thank you for your business.`,
				createdById: owner.id,
			}),
			db.insert(invoiceLine).values(
				lines.map((l, n) => ({
					id: crypto.randomUUID(),
					invoiceId,
					position: l.position,
					description: l.description,
					sku: l.sku,
					quantity: l.quantity,
					unitPriceCents: l.unitPriceCents,
					lineTotalCents: totals.lineTotals[n],
				})),
			),
		);
		invoices++;
	}
	// Atomic per order: the order, its lines and its invoice land together
	await db.batch(statements as [BatchItem<"pg">, ...BatchItem<"pg">[]]);
}

console.log(
	`Added ${productRows.length} products, ${orders} orders and ${invoices} invoices to "${workspace.name}".`,
);
