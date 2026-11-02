import { describe, expect, test } from "bun:test";
import { roleCan } from "#/lib/permissions";

const RESOURCES = [
	"contact",
	"company",
	"project",
	"customer",
	"product",
	"order",
	"invoice",
	"task",
	"activity",
] as const;

describe("workspace roles", () => {
	test("owner and admin have full control of business data", () => {
		for (const role of ["owner", "admin"]) {
			for (const resource of RESOURCES) {
				expect(
					roleCan(role, { [resource]: ["create", "read", "update", "delete"] }),
				).toBe(true);
			}
			expect(roleCan(role, { invoice: ["issue", "pay", "void"] })).toBe(true);
		}
	});

	test("editor can create and edit but not delete or issue invoices", () => {
		for (const resource of RESOURCES) {
			expect(
				roleCan("editor", { [resource]: ["create", "read", "update"] }),
			).toBe(true);
			expect(roleCan("editor", { [resource]: ["delete"] })).toBe(false);
		}
		for (const action of ["issue", "pay", "void"] as const) {
			expect(roleCan("editor", { invoice: [action] })).toBe(false);
		}
	});

	test("viewer can only read", () => {
		for (const resource of RESOURCES) {
			expect(roleCan("viewer", { [resource]: ["read"] })).toBe(true);
			for (const action of ["create", "update", "delete"]) {
				expect(roleCan("viewer", { [resource]: [action] })).toBe(false);
			}
		}
	});

	test("only owner and admin manage members and invitations", () => {
		for (const role of ["owner", "admin"]) {
			expect(roleCan(role, { invitation: ["create"] })).toBe(true);
		}
		for (const role of ["editor", "viewer"]) {
			expect(roleCan(role, { invitation: ["create"] })).toBe(false);
			expect(roleCan(role, { member: ["update", "delete"] })).toBe(false);
		}
	});

	test("only the owner can delete the workspace", () => {
		expect(roleCan("owner", { organization: ["delete"] })).toBe(true);
		for (const role of ["admin", "editor", "viewer"]) {
			expect(roleCan(role, { organization: ["delete"] })).toBe(false);
		}
	});

	test("only owners and admins manage custom fields; everyone can read them", () => {
		for (const role of ["owner", "admin"]) {
			expect(roleCan(role, { field: ["create", "update", "delete"] })).toBe(
				true,
			);
		}
		for (const role of ["editor", "viewer"]) {
			expect(roleCan(role, { field: ["read"] })).toBe(true);
			for (const action of ["create", "update", "delete"] as const) {
				expect(roleCan(role, { field: [action] })).toBe(false);
			}
		}
	});

	test("unknown or missing roles get nothing", () => {
		expect(roleCan(undefined, { project: ["read"] })).toBe(false);
		expect(roleCan("superuser", { project: ["read"] })).toBe(false);
	});
});
