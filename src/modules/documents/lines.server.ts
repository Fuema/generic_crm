import { and, eq, inArray } from "drizzle-orm";
import { db } from "#/db/index";
import { product } from "#/db/schema";
import { m } from "#/paraglide/messages.js";
import type { DocumentLineInput } from "./lines";

// Server-only checks shared by quotes, orders and invoices.

function clientError(status: number, message: string) {
	return new Response(message, { status });
}

// Catalog lines point to this workspace's products; a product newly added to
// the document must be active (one archived since it was added may stay)
export async function assertLineProducts(
	workspaceId: string,
	lines: Pick<DocumentLineInput, "productId">[],
	alreadyOnDocument: (string | null)[],
) {
	const ids = [...new Set(lines.map((l) => l.productId).filter(Boolean))];
	if (!ids.length) return;
	const found = await db
		.select({ id: product.id, archivedAt: product.archivedAt })
		.from(product)
		.where(and(eq(product.workspaceId, workspaceId), inArray(product.id, ids)));
	const had = new Set(alreadyOnDocument);
	const byId = new Map(found.map((p) => [p.id, p]));
	for (const id of ids) {
		const p = byId.get(id);
		if (!p || (p.archivedAt && !had.has(id)))
			throw clientError(400, m.error_choose_product());
	}
}
