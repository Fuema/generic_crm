import { createAccessControl } from "better-auth/plugins/access";
import {
	adminAc,
	defaultStatements,
	ownerAc,
} from "better-auth/plugins/organization/access";
import { m } from "#/paraglide/messages.js";

// Single source of truth for what each workspace role may do.
// Imported by the server (auth.ts) and the browser (auth-client.ts), so both
// sides agree. Add new resources here, e.g. invoice: ["create", "read", ...].
export const statements = {
	...defaultStatements,
	// Custom field definitions (settings): owners and admins manage them
	field: ["create", "read", "update", "delete"],
	// Pipelines and stages (settings): owners and admins manage them
	pipeline: ["create", "read", "update", "delete"],
	contact: ["create", "read", "update", "delete"],
	company: ["create", "read", "update", "delete"],
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
	field: ["create", "read", "update", "delete"],
	pipeline: ["create", "read", "update", "delete"],
	contact: ["create", "read", "update", "delete"],
	company: ["create", "read", "update", "delete"],
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
	field: ["create", "read", "update", "delete"],
	pipeline: ["create", "read", "update", "delete"],
	contact: ["create", "read", "update", "delete"],
	company: ["create", "read", "update", "delete"],
	project: ["create", "read", "update", "delete"],
	customer: ["create", "read", "update", "delete"],
	product: ["create", "read", "update", "delete"],
	order: ["create", "read", "update", "delete"],
	invoice: ["create", "read", "update", "delete", "issue", "pay", "void"],
	task: ["create", "read", "update", "delete"],
	activity: ["create", "read", "update", "delete"],
});

export const editor = ac.newRole({
	field: ["read"],
	pipeline: ["read"],
	contact: ["create", "read", "update"],
	company: ["create", "read", "update"],
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
	field: ["read"],
	pipeline: ["read"],
	contact: ["read"],
	company: ["read"],
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

// Functions, so they resolve in the language of the page that shows them
export const ROLE_LABELS: Record<
	WorkspaceRole,
	{ label: () => string; description: () => string }
> = {
	owner: { label: m.role_owner, description: m.role_owner_description },
	admin: { label: m.role_admin, description: m.role_admin_description },
	editor: { label: m.role_editor, description: m.role_editor_description },
	viewer: { label: m.role_viewer, description: m.role_viewer_description },
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
