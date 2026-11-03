import { describe, expect, test } from "bun:test";
import {
	type MergeRecord,
	mergeConflicts,
	mergeContactsSchema,
	mergeTags,
	mergeValues,
} from "#/modules/contacts/merge";

const base: MergeRecord = {
	firstName: "Ana",
	lastName: null,
	email: null,
	phone: null,
	jobTitle: null,
	companyId: null,
	ownerId: null,
	lifecycleStage: "lead",
	locale: null,
	emailConsent: "unknown",
	custom: {},
};
const contact = (patch: Partial<MergeRecord> = {}): MergeRecord => ({
	...base,
	...patch,
});

describe("mergeConflicts", () => {
	test("only fields where both sides have different values", () => {
		const keep = contact({
			email: "ana@example.com",
			phone: "1",
			custom: { level: "gold", size: "" },
		});
		const dup = contact({
			email: "ANA@example.com",
			phone: "2",
			jobTitle: "CEO",
			custom: { level: "silver", size: "L" },
		});
		expect(mergeConflicts(keep, dup)).toEqual(["phone", "custom.level"]);
	});

	test("unknown consent is empty, so a known consent never conflicts with it", () => {
		const keep = contact({ emailConsent: "unknown" });
		const dup = contact({ emailConsent: "revoked" });
		expect(mergeConflicts(keep, dup)).toEqual([]);
		expect(mergeValues(keep, dup, {}).builtIn.emailConsent).toBe("revoked");
	});
});

describe("mergeValues", () => {
	test("a revoked consent wins unless the user chooses otherwise", () => {
		const keep = contact({ emailConsent: "granted" });
		const dup = contact({ emailConsent: "revoked" });
		expect(mergeValues(keep, dup, {}).builtIn.emailConsent).toBe("revoked");
		expect(mergeValues(dup, keep, {}).builtIn.emailConsent).toBe("revoked");
		expect(
			mergeValues(keep, dup, { emailConsent: "keep" }).builtIn.emailConsent,
		).toBe("granted");
	});

	test("an empty side takes the other's value; conflicts default to the kept one", () => {
		const keep = contact({ phone: "1", custom: { level: "gold" } });
		const dup = contact({
			firstName: "Ann",
			phone: "2",
			jobTitle: "CEO",
			custom: { level: "silver", tags: ["a"] },
		});
		const result = mergeValues(keep, dup, {});
		expect(result.builtIn.firstName).toBe("Ana");
		expect(result.builtIn.phone).toBe("1");
		expect(result.builtIn.jobTitle).toBe("CEO");
		expect(result.custom).toEqual({ level: "gold", tags: ["a"] });
		expect(result.taken).toEqual(["jobTitle", "custom.tags"]);
	});

	test("choices pick the duplicate's value for a conflict", () => {
		const keep = contact({ phone: "1", custom: { level: "gold" } });
		const dup = contact({ phone: "2", custom: { level: "silver" } });
		const result = mergeValues(keep, dup, {
			phone: "duplicate",
			"custom.level": "duplicate",
		});
		expect(result.builtIn.phone).toBe("2");
		expect(result.custom.level).toBe("silver");
		expect(result.taken).toEqual(["phone", "custom.level"]);
	});

	test("a choice for a field without conflict is ignored", () => {
		const keep = contact({ phone: "1" });
		const dup = contact();
		const result = mergeValues(keep, dup, { phone: "duplicate" });
		expect(result.builtIn.phone).toBe("1");
		expect(result.taken).toEqual([]);
	});

	test("empty values are not stored", () => {
		const result = mergeValues(
			contact({ custom: { a: "" } }),
			contact({ custom: { b: [] } }),
			{},
		);
		expect(result.custom).toEqual({});
	});
});

describe("mergeTags", () => {
	test("adds only the tags the kept contact lacks, within the limit", () => {
		expect(mergeTags(["a", "b"], ["b", "c", "c"], 3)).toEqual({
			added: ["c"],
			total: 3,
			ok: true,
		});
		expect(mergeTags(["a", "b"], ["c", "d"], 3).ok).toBe(false);
	});
});

describe("mergeContactsSchema", () => {
	const id = "0190a6f0-0000-7000-8000-000000000001";
	const other = "0190a6f0-0000-7000-8000-000000000002";
	test("rejects merging a contact with itself", () => {
		expect(
			mergeContactsSchema.safeParse({ keepId: id, duplicateId: id }).success,
		).toBe(false);
	});
	test("accepts only keep/duplicate choices", () => {
		expect(
			mergeContactsSchema.safeParse({
				keepId: id,
				duplicateId: other,
				choices: { phone: "duplicate" },
			}).success,
		).toBe(true);
		expect(
			mergeContactsSchema.safeParse({
				keepId: id,
				duplicateId: other,
				choices: { phone: "555-0100" },
			}).success,
		).toBe(false);
	});
});
