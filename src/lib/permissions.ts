import { createAccessControl } from "better-auth/plugins/access";
import {
	adminAc,
	defaultStatements,
	ownerAc,
} from "better-auth/plugins/organization/access";

// Single source of truth for what each workspace role may do.
// Imported by the server (auth.ts) and the browser (auth-client.ts), so both
// sides agree. Add new resources here, e.g. invoice: ["create", "read", ...].
export const statements = {
	...defaultStatements,
	project: ["create", "read", "update", "delete"],
	customer: ["create", "read", "update", "delete"],
	product: ["create", "read", "update", "delete"],
	order: ["create", "read", "update", "delete"],
	// issue = finalize a draft, pay = record payment, void = cancel an issued invoice
	invoice: ["create", "read", "update", "delete", "issue", "pay", "void"],
	task: ["create", "read", "update", "delete"],
	activity: ["create", "read", "update", "delete"],
} as const;

export const ac = createAccessControl(statements);

export const owner = ac.newRole({
	...ownerAc.statements,
	project: ["create", "read", "update", "delete"],
	customer: ["create", "read", "update", "delete"],
	product: ["create", "read", "update", "delete"],
	order: ["create", "read", "update", "delete"],
	invoice: ["create", "read", "update", "delete", "issue", "pay", "void"],
	task: ["create", "read", "update", "delete"],
	activity: ["create", "read", "update", "delete"],
});

// Like owner, but can't delete the workspace
export const admin = ac.newRole({
	...adminAc.statements,
	project: ["create", "read", "update", "delete"],
	customer: ["create", "read", "update", "delete"],
	product: ["create", "read", "update", "delete"],
	order: ["create", "read", "update", "delete"],
	invoice: ["create", "read", "update", "delete", "issue", "pay", "void"],
	task: ["create", "read", "update", "delete"],
	activity: ["create", "read", "update", "delete"],
});

export const editor = ac.newRole({
	project: ["create", "read", "update"],
	customer: ["create", "read", "update"],
	product: ["create", "read", "update"],
	order: ["create", "read", "update"],
	// Editors draft invoices; issuing, payments and voiding stay with owners/admins
	invoice: ["create", "read", "update"],
	task: ["create", "read", "update"],
	activity: ["create", "read", "update"],
});

export const viewer = ac.newRole({
	project: ["read"],
	customer: ["read"],
	product: ["read"],
	order: ["read"],
	invoice: ["read"],
	task: ["read"],
	activity: ["read"],
});

export const roles = { owner, admin, editor, viewer };

export type WorkspaceRole = keyof typeof roles;

// Roles that can be given through an invitation or a role change.
// "owner" is only assigned to the workspace creator.
export const ASSIGNABLE_ROLES = ["admin", "editor", "viewer"] as const;

export const ROLE_LABELS: Record<
	WorkspaceRole,
	{ label: string; description: string }
> = {
	owner: {
		label: "Owner",
		description: "Full control, including deleting the workspace",
	},
	admin: {
		label: "Admin",
		description:
			"Manage members and settings; full control of all data, including issuing invoices",
	},
	editor: {
		label: "Editor",
		description:
			"Create and edit projects, customers, products, orders and draft invoices",
	},
	viewer: { label: "Viewer", description: "View everything, change nothing" },
};

export type Permissions = {
	[K in keyof typeof statements]?: (typeof statements)[K][number][];
};

// Checks a role against the table above without a server round trip. Used only
// to show or hide UI; the server enforces the same rules on every request.
export function roleCan(role: string | undefined, permissions: Permissions) {
	if (!role || !(role in roles)) return false;
	return roles[role as WorkspaceRole].authorize(permissions as never).success;
}
