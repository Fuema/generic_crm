import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { auth, ensureWorkspace } from "#/lib/auth";
import { requireSession } from "#/lib/auth-session";
import type { Permissions, WorkspaceRole } from "#/lib/permissions";

function forbidden(message: string) {
	return new Response(message, { status: 403 });
}

// Guard for server functions: requires a session, an active workspace, and a
// role in that workspace that grants every listed permission. The handler gets
// `context.organizationId` so queries can be scoped to the workspace.
// Usage: createServerFn().middleware([requirePermission({ project: ["delete"] })])
export function requirePermission(permissions: Permissions) {
	return createMiddleware({ type: "function" })
		.middleware([requireSession])
		.server(async ({ next, context }) => {
			const organizationId = context.session.session.activeOrganizationId;
			if (!organizationId) {
				throw forbidden("No active workspace");
			}
			const result = await auth.api.hasPermission({
				headers: getRequestHeaders(),
				body: { organizationId, permissions },
			});
			if (!result.success) {
				throw forbidden(
					"Your role in this workspace doesn't allow this action",
				);
			}
			return next({ context: { organizationId } });
		});
}

// What the current user may do in the active workspace. Used only to show or
// hide UI; every action is still checked again on the server.
export const getWorkspaceAccess = createServerFn({ method: "GET" })
	.middleware([requireSession])
	.handler(async ({ context }) => {
		const headers = getRequestHeaders();
		let organizationId = context.session.session.activeOrganizationId;
		// Sessions created before workspaces existed, or after leaving the last
		// workspace, have none active: pick (or create) one and activate it
		if (!organizationId) {
			organizationId = await ensureWorkspace(context.session.user.id);
			await auth.api.setActiveOrganization({
				headers,
				body: { organizationId },
			});
		}

		const [member, organizations] = await Promise.all([
			auth.api.getActiveMember({ headers }),
			auth.api.listOrganizations({ headers }),
		]);
		if (!member) return null;

		const check = async (permissions: Permissions) =>
			(
				await auth.api.hasPermission({
					headers,
					body: { organizationId, permissions },
				})
			).success;

		const [
			createProject,
			updateProject,
			deleteProject,
			manageMembers,
			invite,
			updateWorkspace,
			deleteWorkspace,
			createCustomer,
			updateCustomer,
			deleteCustomer,
		] = await Promise.all([
			check({ project: ["create"] }),
			check({ project: ["update"] }),
			check({ project: ["delete"] }),
			check({ member: ["update", "delete"] }),
			check({ invitation: ["create"] }),
			check({ organization: ["update"] }),
			check({ organization: ["delete"] }),
			check({ customer: ["create"] }),
			check({ customer: ["update"] }),
			check({ customer: ["delete"] }),
		]);

		return {
			organizationId,
			userId: context.session.user.id,
			role: member.role as WorkspaceRole,
			workspace: organizations.find((o) => o.id === organizationId) ?? null,
			workspaces: organizations.map((o) => ({ id: o.id, name: o.name })),
			can: {
				createProject,
				updateProject,
				deleteProject,
				manageMembers,
				invite,
				updateWorkspace,
				deleteWorkspace,
				createCustomer,
				updateCustomer,
				deleteCustomer,
			},
		};
	});

export type WorkspaceAccess = NonNullable<
	Awaited<ReturnType<typeof getWorkspaceAccess>>
>;
