import { createServerFn } from "@tanstack/react-start";
import { db } from "#/db/index";
import { workspaceSetting } from "#/db/schema";
import { requirePermission } from "#/lib/authz";
import { getWorkspaceSettings } from "#/lib/billing.server";
import { bpToPercent, parsePercentToBp } from "#/lib/money";
import { billingSettingsSchema } from "#/lib/schema";

// Only server functions are exported from this file, so routes can import it:
// TanStack Start replaces each handler with a fetch call in the browser bundle.

export const getBillingSettings = createServerFn({ method: "GET" })
	.middleware([requirePermission({ order: ["read"] })])
	.handler(async ({ context }) => {
		const s = await getWorkspaceSettings(context.workspaceId);
		return {
			currency: s.currency,
			defaultTaxRate: bpToPercent(s.defaultTaxRateBp),
			paymentTermsDays: s.paymentTermsDays,
		};
	});

// Same permission as renaming the workspace (owner/admin)
export const updateBillingSettings = createServerFn({ method: "POST" })
	.middleware([requirePermission({ organization: ["update"] })])
	.validator(billingSettingsSchema)
	.handler(async ({ data, context }) => {
		const defaultTaxRateBp = parsePercentToBp(data.defaultTaxRate);
		if (defaultTaxRateBp === null) {
			throw new Response("Enter a tax rate between 0 and 100", { status: 400 });
		}
		const values = {
			currency: data.currency,
			defaultTaxRateBp,
			paymentTermsDays: data.paymentTermsDays,
			updatedAt: new Date(),
		};
		await db
			.insert(workspaceSetting)
			.values({ workspaceId: context.workspaceId, ...values })
			.onConflictDoUpdate({
				target: workspaceSetting.workspaceId,
				set: values,
			});
		return { ok: true };
	});
