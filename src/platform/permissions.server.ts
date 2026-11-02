import { getRequestHeaders } from "@tanstack/react-start/server";
import { auth } from "#/lib/auth";
import type { Permissions } from "#/lib/permissions";
import { m } from "#/paraglide/messages.js";

// Server-only. Checks the caller's role in the workspace against permissions
// that depend on the input (spec §7.4: requireObjectPermission). Throws 403 when
// the role doesn't allow it; for a session whose active workspace the user has
// left, Better Auth itself rejects the check (401) before any role is evaluated.
export async function assertPermission(
	workspaceId: string,
	permissions: Permissions,
) {
	const result = await auth.api.hasPermission({
		headers: getRequestHeaders(),
		body: { organizationId: workspaceId, permissions },
	});
	if (!result.success) {
		throw new Response(m.error_not_allowed(), { status: 403 });
	}
}

// The same check as a yes/no, for rules like "authors, or owners and admins"
export async function hasPermission(
	workspaceId: string,
	permissions: Permissions,
) {
	const result = await auth.api.hasPermission({
		headers: getRequestHeaders(),
		body: { organizationId: workspaceId, permissions },
	});
	return result.success;
}
