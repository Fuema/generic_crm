import { eq, sql } from "drizzle-orm";
import { db } from "#/db/index";
import { workspaceCounter, workspaceSetting } from "#/db/schema";

// Server-only helpers. Import these ONLY from server-function handlers: plain
// exported functions are not stripped from the browser bundle the way
// createServerFn handlers are, so importing this file from a route or component
// would ship the database client to the browser.

// Next number in a per-workspace sequence, in one atomic statement: concurrent
// requests can never receive the same number.
export async function nextDocumentNumber(
	workspaceId: string,
	kind: "order" | "invoice" | "quote",
	year = 0,
) {
	const [row] = await db
		.insert(workspaceCounter)
		.values({ workspaceId, kind, year, value: 1 })
		.onConflictDoUpdate({
			target: [
				workspaceCounter.workspaceId,
				workspaceCounter.kind,
				workspaceCounter.year,
			],
			set: { value: sql`${workspaceCounter.value} + 1` },
		})
		.returning({ value: workspaceCounter.value });
	return row.value;
}

export async function getWorkspaceSettings(workspaceId: string) {
	const [row] = await db
		.select()
		.from(workspaceSetting)
		.where(eq(workspaceSetting.workspaceId, workspaceId))
		.limit(1);
	return (
		row ?? {
			workspaceId,
			currency: "USD",
			defaultTaxRateBp: 0,
			paymentTermsDays: 30,
			updatedAt: new Date(0),
		}
	);
}
