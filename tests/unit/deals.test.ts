import { describe, expect, test } from "bun:test";
import {
	dayToStored,
	dealInputSchema,
	dealSearchSchema,
	lostReasonProblem,
	MAX_DEAL_CENTS,
	storedToDay,
} from "#/modules/deals/schema";

const valid = {
	name: "Website redesign",
	pipelineId: "0190a6f0-0000-7000-8000-000000000001",
	stageId: "0190a6f0-0000-7000-8000-000000000002",
	valueCents: 150_000,
	expectedClose: "2026-12-15",
	contactId: "0190a6f0-0000-7000-8000-000000000003",
	companyId: "",
	ownerId: "",
};

describe("dealInputSchema", () => {
	test("accepts a valid deal and defaults the lost reason", () => {
		const parsed = dealInputSchema.safeParse(valid);
		expect(parsed.success).toBe(true);
		expect(parsed.data?.lostReason).toBe("");
	});

	test("needs a name and a contact", () => {
		expect(dealInputSchema.safeParse({ ...valid, name: "  " }).success).toBe(
			false,
		);
		expect(dealInputSchema.safeParse({ ...valid, contactId: "" }).success).toBe(
			false,
		);
	});

	test("value is whole cents from 0 to the column limit", () => {
		expect(
			dealInputSchema.safeParse({ ...valid, valueCents: -1 }).success,
		).toBe(false);
		expect(
			dealInputSchema.safeParse({ ...valid, valueCents: 10.5 }).success,
		).toBe(false);
		expect(
			dealInputSchema.safeParse({ ...valid, valueCents: MAX_DEAL_CENTS + 1 })
				.success,
		).toBe(false);
		expect(
			dealInputSchema.safeParse({ ...valid, valueCents: MAX_DEAL_CENTS })
				.success,
		).toBe(true);
	});

	test("expected close is empty or a real calendar day", () => {
		expect(
			dealInputSchema.safeParse({ ...valid, expectedClose: "" }).success,
		).toBe(true);
		expect(
			dealInputSchema.safeParse({ ...valid, expectedClose: "15/12/2026" })
				.success,
		).toBe(false);
		expect(
			dealInputSchema.safeParse({ ...valid, expectedClose: "2026-13-40" })
				.success,
		).toBe(false);
		// A day that doesn't exist must not roll over to the next month
		expect(
			dealInputSchema.safeParse({ ...valid, expectedClose: "2024-02-31" })
				.success,
		).toBe(false);
		expect(
			dealInputSchema.safeParse({ ...valid, expectedClose: "2024-02-29" })
				.success,
		).toBe(true);
	});
});

test("a lost stage needs a reason; other stages don't", () => {
	expect(lostReasonProblem("lost", "")).not.toBeNull();
	expect(lostReasonProblem("lost", "   ")).not.toBeNull();
	expect(lostReasonProblem("lost", "Too expensive")).toBeNull();
	expect(lostReasonProblem("won", "")).toBeNull();
	expect(lostReasonProblem("open", "")).toBeNull();
});

test("all-day dates are stored at 12:00 UTC and read back as the same day", () => {
	const stored = dayToStored("2026-12-15");
	expect(stored?.toISOString()).toBe("2026-12-15T12:00:00.000Z");
	expect(storedToDay(stored)).toBe("2026-12-15");
	expect(dayToStored("")).toBeNull();
	expect(storedToDay(null)).toBe("");
});

test("the list search falls back to safe defaults", () => {
	const parsed = dealSearchSchema.parse({ layout: "grid", status: "maybe" });
	expect(parsed.layout).toBe("list");
	expect(parsed.status).toBeUndefined();
	expect(parsed.show).toBe("active");
});
