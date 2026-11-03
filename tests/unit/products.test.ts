import { describe, expect, test } from "bun:test";
import {
	MAX_PRICE_CENTS,
	productInputSchema,
	productSearchSchema,
} from "#/modules/products/schema";

const valid = {
	name: "Consulting hour",
	sku: "cons-1",
	description: "",
	unitPriceCents: 9_500,
};

describe("productInputSchema", () => {
	test("SKUs are trimmed and upper-cased", () => {
		const parsed = productInputSchema.parse({ ...valid, sku: "  cons-1 " });
		expect(parsed.sku).toBe("CONS-1");
	});

	test("SKUs use letters, numbers, dots, dashes and underscores", () => {
		expect(productInputSchema.safeParse({ ...valid, sku: "A B" }).success).toBe(
			false,
		);
		expect(productInputSchema.safeParse({ ...valid, sku: "-A" }).success).toBe(
			false,
		);
		expect(
			productInputSchema.safeParse({ ...valid, sku: "A.1_x-2" }).success,
		).toBe(true);
	});

	test("prices are whole cents within the column limit", () => {
		expect(
			productInputSchema.safeParse({ ...valid, unitPriceCents: -1 }).success,
		).toBe(false);
		expect(
			productInputSchema.safeParse({ ...valid, unitPriceCents: 1.5 }).success,
		).toBe(false);
		expect(
			productInputSchema.safeParse({
				...valid,
				unitPriceCents: MAX_PRICE_CENTS + 1,
			}).success,
		).toBe(false);
		expect(
			productInputSchema.safeParse({ ...valid, unitPriceCents: 0 }).success,
		).toBe(true);
	});

	test("a name is required", () => {
		expect(productInputSchema.safeParse({ ...valid, name: " " }).success).toBe(
			false,
		);
	});
});

test("the list search falls back to safe defaults", () => {
	// sort may be a custom field ("custom.<key>"); the server checks it
	const parsed = productSearchSchema.parse({ show: "all", dir: "up" });
	expect(parsed.show).toBe("active");
	expect(parsed.sort).toBe("name");
	expect(parsed.dir).toBe("asc");
});
