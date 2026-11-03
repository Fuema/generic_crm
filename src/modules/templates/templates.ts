import { createServerFn } from "@tanstack/react-start";
import { requirePermission } from "#/lib/authz";
import * as data from "./templates.server";

// The Generic template for workspaces created before it existed: owners and
// admins can add whatever is still missing from Settings → Fields.

export const getTemplateStatus = createServerFn({ method: "GET" })
	.middleware([requirePermission({ field: ["read"] })])
	.handler(({ context }) => data.templateStatus(context.workspaceId));

export const applyGenericTemplate = createServerFn({ method: "POST" })
	.middleware([requirePermission({ field: ["create"] })])
	.handler(({ context }) =>
		data.applyTemplate(context.workspaceId, context.session.user.id),
	);
