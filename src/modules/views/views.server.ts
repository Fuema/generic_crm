import { and, asc, count, eq, or } from "drizzle-orm";
import { db } from "#/db/index";
import { savedView, user } from "#/db/schema";
import { listFields } from "#/modules/fields/fields.server";
import type { ObjectKey } from "#/modules/fields/schema";
import { m } from "#/paraglide/messages.js";
import { uuidv7 } from "#/platform/ids";
import type { Json } from "#/platform/json";
import {
	BUILT_IN_COLUMNS,
	BUILT_IN_SORT,
	DEFAULT_SORT,
	filterProblem,
	VIEW_LIMITS,
	type ViewConfig,
} from "./schema";

// Server-only data layer for saved views. A person sees their own views and the
// shared ones; a view is changed by its creator, or (when shared) by an owner or
// admin. Workspace id first, always.

function clientError(status: number, message: string) {
	return new Response(message, { status });
}

// Filters must be valid; unknown columns are dropped; an unknown sort falls back
async function cleanConfig(
	workspaceId: string,
	objectKey: ObjectKey,
	config: ViewConfig,
) {
	const { fields } = await listFields(workspaceId, objectKey, {
		includeArchived: false,
	});
	for (const f of config.filters) {
		const problem = filterProblem(objectKey, f, fields);
		if (problem) throw clientError(400, problem);
	}
	const allowed = new Set([
		...BUILT_IN_COLUMNS[objectKey],
		...fields.map((d) => `custom.${d.key}`),
	]);
	const columns = [...new Set(config.columns)].filter((c) => allowed.has(c));
	const sortable = new Set([
		...BUILT_IN_SORT[objectKey],
		...fields.map((d) => `custom.${d.key}`),
	]);
	const sort = sortable.has(config.sort.field)
		? config.sort
		: DEFAULT_SORT[objectKey];
	return { filters: config.filters, columns, sort } as unknown as Record<
		string,
		Json
	>;
}

export async function listViews(
	workspaceId: string,
	userId: string,
	objectKey: ObjectKey,
	canManageShared: boolean,
) {
	const rows = await db
		.select({
			id: savedView.id,
			name: savedView.name,
			shared: savedView.shared,
			ownerId: savedView.ownerId,
			ownerName: user.name,
			config: savedView.config,
		})
		.from(savedView)
		.leftJoin(user, eq(user.id, savedView.ownerId))
		.where(
			and(
				eq(savedView.workspaceId, workspaceId),
				eq(savedView.objectKey, objectKey),
				or(eq(savedView.ownerId, userId), eq(savedView.shared, true)),
			),
		)
		.orderBy(asc(savedView.name), asc(savedView.id));
	return rows.map((r) => ({
		...r,
		config: r.config as unknown as ViewConfig,
		canEdit: r.ownerId === userId || (r.shared && canManageShared),
	}));
}

// The record type of a view this person can see (404 otherwise), so the
// caller checks read access on the right type before changing it
export async function viewObjectKey(
	workspaceId: string,
	userId: string,
	id: string,
) {
	const [row] = await db
		.select({
			objectKey: savedView.objectKey,
			ownerId: savedView.ownerId,
			shared: savedView.shared,
		})
		.from(savedView)
		.where(and(eq(savedView.id, id), eq(savedView.workspaceId, workspaceId)))
		.limit(1);
	if (!row || (row.ownerId !== userId && !row.shared)) {
		throw clientError(404, m.error_view_not_found());
	}
	return row.objectKey as ObjectKey;
}

async function findEditable(
	workspaceId: string,
	userId: string,
	id: string,
	canManageShared: boolean,
) {
	const [row] = await db
		.select()
		.from(savedView)
		.where(and(eq(savedView.id, id), eq(savedView.workspaceId, workspaceId)))
		.limit(1);
	// Someone else's private view doesn't exist for this person
	if (!row || (row.ownerId !== userId && !row.shared)) {
		throw clientError(404, m.error_view_not_found());
	}
	if (row.ownerId !== userId && !canManageShared) {
		throw clientError(403, m.error_view_owner_only());
	}
	return row as typeof row & { objectKey: ObjectKey };
}

export async function createView(
	workspaceId: string,
	userId: string,
	input: {
		objectKey: ObjectKey;
		name: string;
		shared: boolean;
		config: ViewConfig;
	},
) {
	const [{ total }] = await db
		.select({ total: count() })
		.from(savedView)
		.where(
			and(
				eq(savedView.workspaceId, workspaceId),
				eq(savedView.ownerId, userId),
			),
		);
	if (total >= VIEW_LIMITS.viewsPerMember) {
		throw clientError(
			409,
			m.error_view_limit({ max: VIEW_LIMITS.viewsPerMember }),
		);
	}
	const id = uuidv7();
	await db.insert(savedView).values({
		id,
		workspaceId,
		objectKey: input.objectKey,
		name: input.name,
		ownerId: userId,
		shared: input.shared,
		config: await cleanConfig(workspaceId, input.objectKey, input.config),
	});
	return { id };
}

export async function updateView(
	workspaceId: string,
	userId: string,
	canManageShared: boolean,
	input: { id: string; name?: string; shared?: boolean; config?: ViewConfig },
) {
	const before = await findEditable(
		workspaceId,
		userId,
		input.id,
		canManageShared,
	);
	await db
		.update(savedView)
		.set({
			...(input.name !== undefined ? { name: input.name } : {}),
			...(input.shared !== undefined ? { shared: input.shared } : {}),
			...(input.config
				? {
						config: await cleanConfig(
							workspaceId,
							before.objectKey,
							input.config,
						),
					}
				: {}),
			updatedAt: new Date(),
		})
		.where(
			and(eq(savedView.id, input.id), eq(savedView.workspaceId, workspaceId)),
		);
	return { id: input.id };
}

export async function deleteView(
	workspaceId: string,
	userId: string,
	canManageShared: boolean,
	id: string,
) {
	await findEditable(workspaceId, userId, id, canManageShared);
	await db
		.delete(savedView)
		.where(and(eq(savedView.id, id), eq(savedView.workspaceId, workspaceId)));
	return { id };
}
