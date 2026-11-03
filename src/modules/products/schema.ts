import { z } from "zod";
import { listSearchSchema } from "#/lib/schema";
import { viewState } from "#/modules/contacts/schema";
import { m } from "#/paraglide/messages.js";

// The product catalog (spec §6.2, §10). Shared by the page and the server; the
// server re-checks everything. Quotes, orders and invoices copy a product's
// name, SKU and price onto their lines, so later changes never alter them.

// Integer cents; the column is a 32-bit integer
export const MAX_PRICE_CENTS = 2_000_000_000;

export const productInputSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, { error: () => m.validation_product_name_required() })
		.max(100, { error: () => m.validation_text_max({ max: 100 }) }),
	sku: z
		.string()
		.trim()
		.toUpperCase()
		.min(1, { error: () => m.validation_sku_required() })
		.max(32, { error: () => m.validation_text_max({ max: 32 }) })
		.regex(/^[A-Z0-9][A-Z0-9._-]*$/, {
			error: () => m.validation_sku_format(),
		}),
	description: z
		.string()
		.trim()
		.max(500, { error: () => m.validation_text_max({ max: 500 }) }),
	unitPriceCents: z
		.number()
		.int()
		.min(0, { error: () => m.validation_price() })
		.max(MAX_PRICE_CENTS, { error: () => m.validation_price() }),
	custom: z
		.record(z.string().max(40), z.unknown())
		.refine((r) => Object.keys(r).length <= 100)
		.optional(),
});
export type ProductInput = z.infer<typeof productInputSchema>;

export const updateProductSchema = productInputSchema.extend({
	id: z.uuid({ error: () => m.validation_invalid_id() }),
});

export const productIdSchema = z.object({
	id: z.uuid({ error: () => m.validation_invalid_id() }),
});

export const productSearchSchema = listSearchSchema(
	["active"],
	["name", "sku", "unitPriceCents", "createdAt"],
	"name",
	"asc",
).extend({
	show: z.enum(["active", "archived"]).catch("active").default("active"),
	...viewState("name"),
});
export type ProductSearch = z.infer<typeof productSearchSchema>;

// The line picker of quotes and orders: active products matching a search
export const productPickerSchema = z.object({
	q: z.string().trim().max(100).default(""),
});
