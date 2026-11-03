import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireWorkspace } from "#/lib/authz";
import { OBJECT_KEYS, type ObjectKey } from "#/modules/fields/schema";
import { assertPermission, hasPermission } from "#/platform/permissions.server";
import { viewConfigSchema, viewNameSchema } from "./schema";
import * as data from "./views.server";

// Server functions for saved views. Using views needs read access to the record
// type; changing a shared view needs to be its creator or an owner/admin
// (the `field` settings permission).

const objectKey = z.enum(OBJECT_KEYS);
const viewId = z.object({ id: z.uuid() });

async function context(workspaceId: string, key: ObjectKey | null) {
	// Read access to the record type (also confirms membership)
	await assertPermission(
		workspaceId,
		key ? { [key]: ["read"] } : { contact: ["read"] },
	);
	return hasPermission(workspaceId, { field: ["update"] });
}

export const listViews = createServerFn({ method: "GET" })
	.middleware([requireWorkspace])
	.validator(z.object({ objectKey }))
	.handler(async ({ data: input, context: ctx }) => {
		const canManage = await context(ctx.workspaceId, input.objectKey);
		return data.listViews(
			ctx.workspaceId,
			ctx.session.user.id,
			input.objectKey,
			canManage,
		);
	});

export const createView = createServerFn({ method: "POST" })
	.middleware([requireWorkspace])
	.validator(
		z.object({
			objectKey,
			name: viewNameSchema,
			shared: z.boolean(),
			config: viewConfigSchema,
		}),
	)
	.handler(async ({ data: input, context: ctx }) => {
		await context(ctx.workspaceId, input.objectKey);
		return data.createView(ctx.workspaceId, ctx.session.user.id, input);
	});

export const updateView = createServerFn({ method: "POST" })
	.middleware([requireWorkspace])
	.validator(
		viewId.extend({
			name: viewNameSchema.optional(),
			shared: z.boolean().optional(),
			config: viewConfigSchema.optional(),
		}),
	)
	.handler(async ({ data: input, context: ctx }) => {
		// Membership first, then read access on the view's own record type
		await assertPermission(ctx.workspaceId, { contact: ["read"] }).catch(
			async () => assertPermission(ctx.workspaceId, { company: ["read"] }),
		);
		const key = await data.viewObjectKey(
			ctx.workspaceId,
			ctx.session.user.id,
			input.id,
		);
		const canManage = await context(ctx.workspaceId, key);
		return data.updateView(
			ctx.workspaceId,
			ctx.session.user.id,
			canManage,
			input,
		);
	});

export const deleteView = createServerFn({ method: "POST" })
	.middleware([requireWorkspace])
	.validator(viewId)
	.handler(async ({ data: { id }, context: ctx }) => {
		await assertPermission(ctx.workspaceId, { contact: ["read"] }).catch(
			async () => assertPermission(ctx.workspaceId, { company: ["read"] }),
		);
		const key = await data.viewObjectKey(
			ctx.workspaceId,
			ctx.session.user.id,
			id,
		);
		const canManage = await context(ctx.workspaceId, key);
		return data.deleteView(ctx.workspaceId, ctx.session.user.id, canManage, id);
	});

export type SavedViewRow = Awaited<ReturnType<typeof listViews>>[number];
