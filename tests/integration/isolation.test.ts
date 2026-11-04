import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { db } from "#/db/index";
import {
	company,
	contact,
	customer,
	deal,
	event,
	fieldDefinition,
	fieldGroup,
	invoice,
	note,
	orderLine,
	organization,
	pipeline,
	pipelineStage,
	product,
	quote,
	recordTag,
	salesOrder,
	savedView,
	tag,
	workspaceCounter,
	workspaceSetting,
} from "#/db/schema";
import { getWorkspaceSettings, nextDocumentNumber } from "#/lib/billing.server";
import { assertWorkspaceRefs } from "#/lib/workspace-refs.server";
import * as contacts from "#/modules/contacts/contacts.server";
import * as deals from "#/modules/deals/deals.server";
import * as invoices from "#/modules/invoices/invoices.server";
import * as orders from "#/modules/orders/orders.server";
import * as pipelines from "#/modules/pipelines/pipelines.server";
import * as quotes from "#/modules/quotes/quotes.server";
import * as records from "#/modules/records/records.server";
import { applyTemplateToNewWorkspace } from "#/modules/templates/templates.server";
import { cleanup, createWorkspace, type Workspace } from "./fixtures";

// Workspace A must never see or use workspace B's data (spec §12.1)
let a: Workspace;
let b: Workspace;

beforeAll(async () => {
	[a, b] = await Promise.all([createWorkspace("a"), createWorkspace("b")]);
});

afterAll(cleanup);

async function rejection(promise: Promise<unknown>) {
	try {
		await promise;
	} catch (error) {
		return error;
	}
	throw new Error("Expected the call to be rejected");
}

describe("assertWorkspaceRefs", () => {
	test("accepts references from the same workspace", async () => {
		await assertWorkspaceRefs(a.workspaceId, {
			userId: a.userId,
			customerId: a.customerId,
			orderId: a.orderId,
		});
	});

	test("rejects another workspace's member, customer and order", async () => {
		for (const refs of [
			{ userId: b.userId },
			{ customerId: b.customerId },
			{ orderId: b.orderId },
		]) {
			const error = await rejection(assertWorkspaceRefs(a.workspaceId, refs));
			expect(error).toBeInstanceOf(Response);
			expect((error as Response).status).toBe(400);
		}
	});

	test("rejects ids that don't exist", async () => {
		const error = await rejection(
			assertWorkspaceRefs(a.workspaceId, { customerId: crypto.randomUUID() }),
		);
		expect((error as Response).status).toBe(400);
	});
});

describe("document numbers", () => {
	test("count separately per workspace and year", async () => {
		expect(await nextDocumentNumber(a.workspaceId, "invoice", 2026)).toBe(1);
		expect(await nextDocumentNumber(a.workspaceId, "invoice", 2026)).toBe(2);
		expect(await nextDocumentNumber(b.workspaceId, "invoice", 2026)).toBe(1);
		expect(await nextDocumentNumber(a.workspaceId, "invoice", 2027)).toBe(1);
		expect(await nextDocumentNumber(a.workspaceId, "order")).toBe(1);
	});

	test("concurrent requests never get the same number", async () => {
		const numbers = await Promise.all(
			Array.from({ length: 10 }, () =>
				nextDocumentNumber(b.workspaceId, "order"),
			),
		);
		expect(new Set(numbers).size).toBe(10);
		expect([...numbers].sort((x, y) => x - y)).toEqual([
			1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
		]);
	});
});

describe("workspace settings", () => {
	test("one workspace's settings never apply to another", async () => {
		await db.insert(workspaceSetting).values({
			workspaceId: a.workspaceId,
			currency: "EUR",
			defaultTaxRateBp: 2100,
		});
		expect((await getWorkspaceSettings(a.workspaceId)).currency).toBe("EUR");
		const other = await getWorkspaceSettings(b.workspaceId);
		expect(other.currency).toBe("USD");
		expect(other.defaultTaxRateBp).toBe(0);
	});
});

describe("database rules", () => {
	test("the same customer email and SKU are allowed in two workspaces", async () => {
		// The fixtures already gave both workspaces "shared@example.com" and "SKU-1"
		const emails = await db
			.select({ id: customer.id })
			.from(customer)
			.where(
				sql`lower(${customer.email}) = 'shared@example.com' and ${customer.workspaceId} in (${a.workspaceId}, ${b.workspaceId})`,
			);
		expect(emails).toHaveLength(2);
	});

	test("but not twice within one workspace, ignoring case", async () => {
		const duplicateCustomer = db.insert(customer).values({
			id: crypto.randomUUID(),
			workspaceId: a.workspaceId,
			name: "Duplicate",
			email: "SHARED@example.com",
		});
		expect(await rejection(duplicateCustomer)).toBeInstanceOf(Error);

		const duplicateProduct = db.insert(product).values({
			id: crypto.randomUUID(),
			workspaceId: a.workspaceId,
			name: "Duplicate",
			sku: "sku-1",
			unitPriceCents: 1,
		});
		expect(await rejection(duplicateProduct)).toBeInstanceOf(Error);
	});

	test("deleting a workspace removes all of its data and nothing else", async () => {
		const c = await createWorkspace("c");
		// Phase 1 and 2 data too: template fields, groups, views and the Sales
		// pipeline, a company, a contact (with events), a tag and a note
		const actor = { type: "member" as const, id: c.userId };
		await applyTemplateToNewWorkspace(c.workspaceId, c.userId);
		const acme = await contacts.createCompany(c.workspaceId, actor, {
			name: "Acme",
			domain: "",
			phone: "",
			city: "",
			country: "",
			ownerId: "",
		});
		const ana = await contacts.createContact(c.workspaceId, actor, {
			firstName: "Ana",
			lastName: "",
			email: "",
			phone: "",
			jobTitle: "",
			companyId: acme.id,
			ownerId: "",
			lifecycleStage: "lead",
			locale: "",
			emailConsent: "unknown",
		});
		const subject = { subjectType: "contact" as const, subjectId: ana.id };
		await records.addTag(c.workspaceId, actor, { ...subject, name: "vip" });
		await records.createNote(c.workspaceId, actor, { ...subject, body: "Hi" });
		const [sales] = await pipelines.listPipelines(c.workspaceId, {
			includeArchived: false,
		});
		await deals.createDeal(c.workspaceId, actor, {
			name: "Deal",
			pipelineId: sales.id,
			stageId: sales.stages[0].id,
			valueCents: 100,
			expectedClose: "",
			contactId: ana.id,
			companyId: acme.id,
			ownerId: "",
			lostReason: "",
		});
		await quotes.createQuote(c.workspaceId, actor, { contactId: ana.id });
		const order = await orders.createOrder(c.workspaceId, actor, {
			contactId: ana.id,
		});
		await orders.updateOrder(c.workspaceId, actor, {
			id: order.id,
			contactId: ana.id,
			companyId: "",
			ownerId: "",
			locale: "en",
			taxRateBp: 0,
			orderDate: "",
			notes: "",
			lines: [
				{
					productId: "",
					description: "Line",
					sku: "",
					quantity: 1,
					unitPriceCents: 1,
				},
			],
		});
		await invoices.createInvoice(c.workspaceId, actor, { contactId: ana.id });

		const phase1 = [
			company,
			contact,
			tag,
			recordTag,
			note,
			event,
			fieldGroup,
			fieldDefinition,
			savedView,
			pipeline,
			pipelineStage,
			deal,
			quote,
			invoice,
			orderLine,
		];
		for (const table of phase1) {
			const [{ n }] = await db
				.select({ n: sql<number>`count(*)::int` })
				.from(table)
				.where(eq(table.workspaceId, c.workspaceId));
			expect(n).toBeGreaterThan(0);
		}

		await db.delete(organization).where(eq(organization.id, c.workspaceId));

		for (const table of [
			customer,
			product,
			salesOrder,
			workspaceCounter,
			workspaceSetting,
			...phase1,
		]) {
			const left = await db
				.select({ n: sql<number>`count(*)::int` })
				.from(table)
				.where(eq(table.workspaceId, c.workspaceId));
			expect(left[0].n).toBe(0);
		}
		const survivors = await db
			.select({ id: customer.id })
			.from(customer)
			.where(eq(customer.workspaceId, a.workspaceId));
		expect(survivors).toHaveLength(1);
	}, 30_000); // creates a full workspace through many requests
});
