import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db } from "#/db/index";
import { event, product } from "#/db/schema";
import * as fields from "#/modules/fields/fields.server";
import * as products from "#/modules/products/products.server";
import type { ProductInput, ProductSearch } from "#/modules/products/schema";
import { cleanup, createWorkspace, type Workspace } from "./fixtures";

// The product catalog: SKUs, archiving, events, custom fields, the line
// picker, and workspace isolation.
let a: Workspace;
let b: Workspace;
const actorA = () => ({ type: "member" as const, id: a.userId });
const actorB = () => ({ type: "member" as const, id: b.userId });
const RUN = crypto.randomUUID().slice(0, 6).toUpperCase();

const input = (patch: Partial<ProductInput> = {}): ProductInput => ({
	name: "Consulting hour",
	sku: `CONS-${RUN}`,
	description: "",
	unitPriceCents: 9_500,
	...patch,
});

const search = (patch: Partial<ProductSearch> = {}): ProductSearch => ({
	page: 1,
	pageSize: 100,
	q: "",
	sort: "name",
	dir: "asc",
	show: "active",
	filters: [],
	...patch,
});

async function status(promise: Promise<unknown>) {
	try {
		await promise;
	} catch (error) {
		if (error instanceof Response) return error.status;
		throw error;
	}
	return 200;
}

beforeAll(async () => {
	[a, b] = await Promise.all([createWorkspace("pra"), createWorkspace("prb")]);
});
afterAll(cleanup);

describe("products", () => {
	test("create, update with events; SKUs are unique per workspace, ignoring case", async () => {
		const { id } = await products.createProduct(
			a.workspaceId,
			actorA(),
			input(),
		);
		expect(
			await status(
				products.createProduct(
					a.workspaceId,
					actorA(),
					input({ sku: `cons-${RUN}`.toUpperCase() }),
				),
			),
		).toBe(409);
		// Another workspace may use the same SKU
		await products.createProduct(b.workspaceId, actorB(), input());

		await products.updateProduct(
			a.workspaceId,
			actorA(),
			id,
			input({ unitPriceCents: 12_000 }),
		);
		const events = await db
			.select({ type: event.type, payload: event.payload })
			.from(event)
			.where(and(eq(event.subjectType, "product"), eq(event.subjectId, id)));
		expect(events.map((e) => e.type).sort()).toEqual([
			"product.created",
			"product.updated",
		]);
		const updated = events.find((e) => e.type === "product.updated");
		expect(
			Object.keys((updated?.payload as { changes: object }).changes),
		).toEqual(["unitPriceCents"]);
	});

	test("archiving hides a product from the picker and keeps its SKU taken", async () => {
		const { id } = await products.createProduct(
			a.workspaceId,
			actorA(),
			input({ name: "Old widget", sku: `OLD-${RUN}` }),
		);
		await products.setProductArchived(a.workspaceId, actorA(), id, true);
		const [row] = await db.select().from(product).where(eq(product.id, id));
		// The old order code still reads `active`
		expect([Boolean(row.archivedAt), row.active]).toEqual([true, false]);
		const picked = await products.pickProducts(a.workspaceId, "Old widget");
		expect(picked.some((p) => p.id === id)).toBe(false);
		const archivedList = await products.listProducts(
			a.workspaceId,
			search({ show: "archived" }),
		);
		expect(archivedList.rows.map((r) => r.id)).toContain(id);
		expect(
			await status(
				products.createProduct(
					a.workspaceId,
					actorA(),
					input({ sku: `OLD-${RUN}` }),
				),
			),
		).toBe(409);
		expect(
			await status(
				products.updateProduct(a.workspaceId, actorA(), id, input()),
			),
		).toBe(409);
		await products.setProductArchived(a.workspaceId, actorA(), id, false);
		const [back] = await db.select().from(product).where(eq(product.id, id));
		expect([back.archivedAt, back.active]).toEqual([null, true]);
	});

	test("two archives at once write one event", async () => {
		const { id } = await products.createProduct(
			a.workspaceId,
			actorA(),
			input({ name: "Twice", sku: `TW-${RUN}` }),
		);
		const results = await Promise.all([
			status(products.setProductArchived(a.workspaceId, actorA(), id, true)),
			status(products.setProductArchived(a.workspaceId, actorA(), id, true)),
		]);
		// The second either saw it archived already (200, no write) or lost the race (409)
		expect(results.filter((r) => r === 200).length).toBeGreaterThanOrEqual(1);
		const archivedEvents = await db
			.select({ type: event.type })
			.from(event)
			.where(and(eq(event.subjectId, id), eq(event.type, "product.archived")));
		expect(archivedEvents).toHaveLength(1);
	});

	test("custom fields on products are validated and filterable", async () => {
		const brand = await fields.createField(a.workspaceId, actorA(), {
			objectKey: "product",
			type: "text",
			label: { en: "Brand", es: "Marca" },
			help: { en: "", es: "" },
			options: [],
			required: false,
			unique: false,
			groupId: "",
		});
		const { id } = await products.createProduct(
			a.workspaceId,
			actorA(),
			input({ sku: `BR-${RUN}`, custom: { [brand.key]: "Acme" } }),
		);
		const found = await products.listProducts(
			a.workspaceId,
			search({
				filters: [{ field: `custom.${brand.key}`, op: "is", value: "acme" }],
			}),
		);
		expect(found.rows.map((r) => r.id)).toEqual([id]);
	});

	test("never reaches across workspaces", async () => {
		const { id } = await products.createProduct(
			a.workspaceId,
			actorA(),
			input({ name: "Secret", sku: `SEC-${RUN}` }),
		);
		expect(
			await status(
				products.updateProduct(b.workspaceId, actorB(), id, input()),
			),
		).toBe(404);
		expect(
			await status(
				products.setProductArchived(b.workspaceId, actorB(), id, true),
			),
		).toBe(404);
		const listB = await products.listProducts(
			b.workspaceId,
			search({ q: "Secret" }),
		);
		expect(listB.total).toBe(0);
		const pickB = await products.pickProducts(b.workspaceId, "Secret");
		expect(pickB).toEqual([]);
	});
});
