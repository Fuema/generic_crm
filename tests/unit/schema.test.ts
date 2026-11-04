import { describe, expect, test } from "bun:test";
import { emailSchema, nameSchema, passwordSchema } from "#/lib/schema";

describe("nameSchema", () => {
	test("accepts names with accents, apostrophes, dots and hyphens", () => {
		for (const name of [
			"Ana",
			"José Núñez",
			"O'Brien",
			"Jean-Luc",
			"J. R. Smith",
		]) {
			expect(nameSchema.safeParse(name).success).toBe(true);
		}
	});

	test("rejects digits, symbols and names that are too short", () => {
		for (const name of ["A", "Phase0", "<script>", "-Ana", "a".repeat(51)]) {
			expect(nameSchema.safeParse(name).success).toBe(false);
		}
	});
});

describe("emailSchema", () => {
	test("trims and lowercases", () => {
		expect(emailSchema.parse("  Ana@Example.COM ")).toBe("ana@example.com");
	});

	test("rejects invalid addresses", () => {
		expect(emailSchema.safeParse("not-an-email").success).toBe(false);
	});
});

describe("passwordSchema", () => {
	test("accepts a strong password", () => {
		expect(passwordSchema.safeParse("Gc-2026-Xq9!vLm").success).toBe(true);
	});

	test("rejects weak passwords and surrounding spaces", () => {
		for (const pw of ["short", "alllowercase-but-long", " Gc-2026-Xq9!vLm"]) {
			expect(passwordSchema.safeParse(pw).success).toBe(false);
		}
	});
});
