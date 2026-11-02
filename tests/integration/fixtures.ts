import { inArray } from "drizzle-orm";
import { db } from "#/db/index";
import {
	customer,
	member,
	organization,
	product,
	salesOrder,
	user,
} from "#/db/schema";

// Every run uses random ids and names, so parallel or interrupted runs never
// collide, and cleanup only touches what this run created.
const RUN = crypto.randomUUID().slice(0, 8);
const created = { workspaces: [] as string[], users: [] as string[] };

export type Workspace = Awaited<ReturnType<typeof createWorkspace>>;

// A workspace with one owner, one customer, one product and one order
export async function createWorkspace(label: string) {
	const now = new Date();
	const workspaceId = crypto.randomUUID();
	const userId = crypto.randomUUID();
	const customerId = crypto.randomUUID();
	const productId = crypto.randomUUID();
	const orderId = crypto.randomUUID();
	created.workspaces.push(workspaceId);
	created.users.push(userId);

	await db.batch([
		db.insert(user).values({
			id: userId,
			name: `Test ${label}`,
			email: `it-${RUN}-${label}@example.com`,
			emailVerified: true,
			createdAt: now,
			updatedAt: now,
		}),
		db.insert(organization).values({
			id: workspaceId,
			name: `Workspace ${label}`,
			slug: `it-${RUN}-${label}`,
			createdAt: now,
		}),
		db.insert(member).values({
			id: crypto.randomUUID(),
			organizationId: workspaceId,
			userId,
			role: "owner",
			createdAt: now,
		}),
		db.insert(customer).values({
			id: customerId,
			workspaceId,
			name: `Customer ${label}`,
			email: "shared@example.com",
		}),
		db.insert(product).values({
			id: productId,
			workspaceId,
			name: `Product ${label}`,
			sku: "SKU-1",
			unitPriceCents: 1000,
		}),
		db.insert(salesOrder).values({
			id: orderId,
			workspaceId,
			number: 1,
			customerId,
			currency: "USD",
		}),
	]);

	return { workspaceId, userId, customerId, productId, orderId };
}

// Deleting a workspace cascades to all of its data
export async function cleanup() {
	if (created.workspaces.length) {
		await db
			.delete(organization)
			.where(inArray(organization.id, created.workspaces));
	}
	if (created.users.length) {
		await db.delete(user).where(inArray(user.id, created.users));
	}
}
