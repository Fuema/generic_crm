import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requirePermission } from "#/lib/authz";
import { getWorkspaceSettings } from "#/lib/billing.server";
import * as data from "./fields.server";
import {
	createFieldSchema,
	createGroupSchema,
	fieldIdSchema,
	OBJECT_KEYS,
	objectKeySchema,
	reorderSchema,
	updateFieldSchema,
	updateGroupSchema,
} from "./schema";

// Server functions for custom field settings. Reading definitions is allowed to
// every role (forms need them); changing them is for owners and admins.

const member = (userId: string) => ({ type: "member" as const, id: userId });

// Active groups and fields of one record type, plus the workspace currency for
// money fields: what record pages and forms need
export const getRecordFields = createServerFn({ method: "GET" })
	.middleware([requirePermission({ field: ["read"] })])
	.validator(objectKeySchema)
	.handler(async ({ data: { objectKey }, context }) => {
		const [fields, settings] = await Promise.all([
			data.listFields(context.workspaceId, objectKey, {
				includeArchived: false,
			}),
			getWorkspaceSettings(context.workspaceId),
		]);
		return { ...fields, currency: settings.currency };
	});

// Everything for the settings page, archived included
export const getFieldSettings = createServerFn({ method: "GET" })
	.middleware([requirePermission({ field: ["read"] })])
	.validator(objectKeySchema)
	.handler(({ data: { objectKey }, context }) =>
		data.listFields(context.workspaceId, objectKey, { includeArchived: true }),
	);

export const createField = createServerFn({ method: "POST" })
	.middleware([requirePermission({ field: ["create"] })])
	.validator(createFieldSchema)
	.handler(({ data: input, context }) =>
		data.createField(
			context.workspaceId,
			member(context.session.user.id),
			input,
		),
	);

export const updateField = createServerFn({ method: "POST" })
	.middleware([requirePermission({ field: ["update"] })])
	.validator(updateFieldSchema)
	.handler(({ data: input, context }) =>
		data.updateField(
			context.workspaceId,
			member(context.session.user.id),
			input,
		),
	);

export const setFieldArchived = createServerFn({ method: "POST" })
	.middleware([requirePermission({ field: ["delete"] })])
	.validator(fieldIdSchema.extend({ archived: z.boolean() }))
	.handler(({ data: { id, archived }, context }) =>
		data.setFieldArchived(
			context.workspaceId,
			member(context.session.user.id),
			id,
			archived,
		),
	);

export const reorderFields = createServerFn({ method: "POST" })
	.middleware([requirePermission({ field: ["update"] })])
	.validator(reorderSchema.extend({ table: z.enum(["field", "group"]) }))
	.handler(({ data: { table, objectKey, ids }, context }) =>
		data.reorder(context.workspaceId, table, objectKey, ids),
	);

export const createGroup = createServerFn({ method: "POST" })
	.middleware([requirePermission({ field: ["create"] })])
	.validator(createGroupSchema)
	.handler(({ data: input, context }) =>
		data.createGroup(
			context.workspaceId,
			member(context.session.user.id),
			input,
		),
	);

export const updateGroup = createServerFn({ method: "POST" })
	.middleware([requirePermission({ field: ["update"] })])
	.validator(updateGroupSchema)
	.handler(({ data: input, context }) =>
		data.updateGroup(
			context.workspaceId,
			member(context.session.user.id),
			input,
		),
	);

export const setGroupArchived = createServerFn({ method: "POST" })
	.middleware([requirePermission({ field: ["delete"] })])
	.validator(fieldIdSchema.extend({ archived: z.boolean() }))
	.handler(({ data: { id, archived }, context }) =>
		data.setGroupArchived(
			context.workspaceId,
			member(context.session.user.id),
			id,
			archived,
		),
	);

export type RecordFields = Awaited<ReturnType<typeof getRecordFields>>;
export type FieldSettings = Awaited<ReturnType<typeof getFieldSettings>>;
export { OBJECT_KEYS };
