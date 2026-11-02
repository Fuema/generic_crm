import { eq, sql } from "drizzle-orm";
import { db } from "#/db/index";
import { tenantCounter, tenantSetting } from "#/db/schema";

// Server-only helpers. Import these ONLY from server-function handlers: plain
// exported functions are not stripped from the browser bundle the way
// createServerFn handlers are, so importing this file from a route or component
// would ship the database client to the browser.

// Next number in a per-tenant sequence, in one atomic statement: concurrent
// requests can never receive the same number.
export async function nextDocumentNumber(
	tenantId: string,
	kind: "order" | "invoice",
	year = 0,
) {
	const [row] = await db
		.insert(tenantCounter)
		.values({ tenantId, kind, year, value: 1 })
		.onConflictDoUpdate({
			target: [tenantCounter.tenantId, tenantCounter.kind, tenantCounter.year],
			set: { value: sql`${tenantCounter.value} + 1` },
		})
		.returning({ value: tenantCounter.value });
	return row.value;
}

export async function getTenantSettings(tenantId: string) {
	const [row] = await db
		.select()
		.from(tenantSetting)
		.where(eq(tenantSetting.tenantId, tenantId))
		.limit(1);
	return (
		row ?? {
			tenantId,
			currency: "USD",
			defaultTaxRateBp: 0,
			paymentTermsDays: 30,
			updatedAt: new Date(0),
		}
	);
}
