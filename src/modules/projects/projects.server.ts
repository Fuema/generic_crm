import {
	and,
	count,
	desc,
	eq,
	ilike,
	isNotNull,
	isNull,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import { db } from "#/db/index";
import { company, contact, deal, project } from "#/db/schema";
import { assertWorkspaceRefs } from "#/lib/workspace-refs.server";
import { dayToStored } from "#/modules/documents/lines";
import {
	customChanges,
	listFields,
	prepareCustom,
} from "#/modules/fields/fields.server";
import {
	filterConditions,
	sortExpression,
} from "#/modules/views/filters.server";
import { m } from "#/paraglide/messages.js";
import {
	type Actor,
	changedFields,
	eventInsert,
} from "#/platform/events.server";
import { uuidv7 } from "#/platform/ids";
import type { Json } from "#/platform/json";
import type { ProjectInput, ProjectSearch } from "./schema";

// Server-only data layer for projects. Every function takes the workspace id
// first and filters by it; the server functions in projects.ts pass
// context.workspaceId from the session, never a value from input. A change and
// its event are written in one db.batch (spec §11.1).

function clientError(status: number, message: string) {
	return new Response(message, { status });
}

function likePattern(term: string) {
	return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

function errorCode(error: unknown) {
	const e = error as { code?: string; cause?: { code?: string } };
	return e?.code ?? e?.cause?.code;
}

async function runBatch(statements: unknown[]) {
	try {
		await db.batch(statements as unknown as Parameters<typeof db.batch>[0]);
	} catch (error) {
		const code = errorCode(error);
		if (code === "22012") throw clientError(409, m.error_project_changed());
		// project_workspace_deal_active_unique: the deal already has one
		if (code === "23505") throw clientError(409, m.error_deal_has_project());
		throw error;
	}
}

const contactNameOfProject = sql<
	string | null
>`(select concat_ws(' ', c."first_name", c."last_name") from "contact" c where c."id" = "project"."contact_id" and c."workspace_id" = "project"."workspace_id")`;
const companyNameOfProject = sql<
	string | null
>`(select co."name" from "company" co where co."id" = "project"."company_id" and co."workspace_id" = "project"."workspace_id")`;
const dealNameOfProject = sql<
	string | null
>`(select d."name" from "deal" d where d."id" = "project"."deal_id" and d."workspace_id" = "project"."workspace_id")`;
const ownerNameOfProject = sql<
	string | null
>`(select u."name" from "user" u where u."id" = "project"."owner_id")`;

const PROJECT_SORT = {
	name: project.name,
	startDate: project.startDate,
	dueDate: project.dueDate,
	createdAt: project.createdAt,
} as const;

const listColumns = {
	id: project.id,
	name: project.name,
	status: project.status,
	startDate: project.startDate,
	dueDate: project.dueDate,
	ownerId: project.ownerId,
	contactId: project.contactId,
	companyId: project.companyId,
	dealId: project.dealId,
	custom: project.custom,
	archivedAt: project.archivedAt,
	createdAt: project.createdAt,
	contactName: contactNameOfProject,
	companyName: companyNameOfProject,
	dealName: dealNameOfProject,
	ownerName: ownerNameOfProject,
};

export async function listProjects(workspaceId: string, search: ProjectSearch) {
	const filters: SQL[] = [
		eq(project.workspaceId, workspaceId),
		search.show === "archived"
			? isNotNull(project.archivedAt)
			: isNull(project.archivedAt),
	];
	if (search.q) {
		const pattern = likePattern(search.q);
		const match = or(
			ilike(project.name, pattern),
			sql`coalesce(${contactNameOfProject}, '') ilike ${pattern}`,
			sql`coalesce(${companyNameOfProject}, '') ilike ${pattern}`,
		);
		if (match) filters.push(match);
	}
	if (search.status) filters.push(eq(project.status, search.status));
	const { fields } = await listFields(workspaceId, "project", {
		includeArchived: false,
	});
	filters.push(...filterConditions("project", search.filters, fields));
	const where = and(...filters);
	const order = sortExpression(
		"project",
		{ field: search.sort, dir: search.dir },
		fields,
		PROJECT_SORT,
	);
	const [rows, [{ total }]] = await Promise.all([
		db
			.select(listColumns)
			.from(project)
			.where(where)
			.orderBy(order, desc(project.id))
			.limit(search.pageSize)
			.offset((search.page - 1) * search.pageSize),
		db.select({ total: count() }).from(project).where(where),
	]);
	return {
		rows,
		total,
		pageCount: Math.max(1, Math.ceil(total / search.pageSize)),
	};
}
export type ProjectListRow = Awaited<
	ReturnType<typeof listProjects>
>["rows"][number];

async function findProject(workspaceId: string, id: string) {
	const [row] = await db
		.select()
		.from(project)
		.where(and(eq(project.id, id), eq(project.workspaceId, workspaceId)))
		.limit(1);
	if (!row) throw clientError(404, m.error_project_not_found());
	return row;
}

export async function getProjectDetail(workspaceId: string, id: string) {
	const row = await findProject(workspaceId, id);
	const [names] = await db
		.select({
			contactName: contactNameOfProject,
			companyName: companyNameOfProject,
			dealName: dealNameOfProject,
			ownerName: ownerNameOfProject,
		})
		.from(project)
		.where(and(eq(project.id, id), eq(project.workspaceId, workspaceId)));
	return { project: row, ...names };
}

// Contact, company and owner are checked when set or changed
async function assertProjectRefs(
	workspaceId: string,
	data: ProjectInput,
	before?: {
		contactId: string | null;
		companyId: string | null;
		ownerId: string | null;
	},
) {
	const contactId = data.contactId || null;
	const companyId = data.companyId || null;
	const ownerId = data.ownerId || null;
	await Promise.all([
		contactId && contactId !== (before?.contactId ?? null)
			? db
					.select({ id: contact.id })
					.from(contact)
					.where(
						and(
							eq(contact.id, contactId),
							eq(contact.workspaceId, workspaceId),
							isNull(contact.archivedAt),
						),
					)
					.limit(1)
					.then(([r]) => {
						if (!r) throw clientError(400, m.error_choose_contact());
					})
			: null,
		companyId && companyId !== (before?.companyId ?? null)
			? db
					.select({ id: company.id })
					.from(company)
					.where(
						and(
							eq(company.id, companyId),
							eq(company.workspaceId, workspaceId),
							isNull(company.archivedAt),
						),
					)
					.limit(1)
					.then(([r]) => {
						if (!r) throw clientError(400, m.error_choose_company());
					})
			: null,
		ownerId && ownerId !== (before?.ownerId ?? null)
			? assertWorkspaceRefs(workspaceId, { userId: ownerId })
			: null,
	]);
}

function projectRow(data: ProjectInput) {
	return {
		name: data.name,
		description: data.description || null,
		status: data.status,
		startDate: dayToStored(data.startDate),
		dueDate: dayToStored(data.dueDate),
		ownerId: data.ownerId || null,
		contactId: data.contactId || null,
		companyId: data.companyId || null,
	};
}

export async function createProject(
	workspaceId: string,
	actor: Actor,
	data: ProjectInput,
) {
	await assertProjectRefs(workspaceId, data);
	const custom = await prepareCustom(workspaceId, "project", data.custom ?? {});
	const id = uuidv7();
	await runBatch([
		db.insert(project).values({
			id,
			workspaceId,
			...projectRow(data),
			custom,
			createdById: actor.type === "member" ? actor.id : null,
		}),
		eventInsert(workspaceId, actor, {
			type: "project.created",
			subjectType: "project",
			subjectId: id,
		}),
	]);
	return { id };
}

// "Create project" on a won deal (owner decision: a button, not automatic).
// One active project per deal; its name, contact and company come along.
export async function createProjectFromDeal(
	workspaceId: string,
	actor: Actor,
	dealId: string,
) {
	const [d] = await db
		.select()
		.from(deal)
		.where(and(eq(deal.id, dealId), eq(deal.workspaceId, workspaceId)))
		.limit(1);
	if (!d) throw clientError(404, m.error_deal_not_found());
	if (d.archivedAt) throw clientError(409, m.error_record_archived());
	if (d.status !== "won")
		throw clientError(409, m.error_project_deal_not_won());
	const [existing] = await db
		.select({ id: project.id })
		.from(project)
		.where(
			and(
				eq(project.workspaceId, workspaceId),
				eq(project.dealId, dealId),
				isNull(project.archivedAt),
			),
		)
		.limit(1);
	if (existing) throw clientError(409, m.error_deal_has_project());
	const id = uuidv7();
	await runBatch([
		// The deal is still won, and still without an active project
		db
			.select({ id: deal.id })
			.from(deal)
			.where(and(eq(deal.id, dealId), eq(deal.workspaceId, workspaceId)))
			.for("update"),
		db
			.select({
				ok: sql<number>`1 / (case when exists (select 1 from "deal" d where d."id" = ${dealId} and d."workspace_id" = ${workspaceId} and d."status" = 'won' and d."archived_at" is null) and not exists (select 1 from "project" p where p."deal_id" = ${dealId} and p."workspace_id" = ${workspaceId} and p."archived_at" is null) then 1 else 0 end)`,
			})
			.from(deal)
			.where(and(eq(deal.id, dealId), eq(deal.workspaceId, workspaceId))),
		db.insert(project).values({
			id,
			workspaceId,
			name: d.name,
			status: "planned",
			ownerId: d.ownerId,
			contactId: d.contactId,
			companyId: d.companyId,
			dealId: d.id,
			createdById: actor.type === "member" ? actor.id : null,
		}),
		eventInsert(workspaceId, actor, {
			type: "project.created",
			subjectType: "project",
			subjectId: id,
			payload: { dealId },
		}),
	]);
	return { id };
}

export async function updateProject(
	workspaceId: string,
	actor: Actor,
	id: string,
	data: ProjectInput,
) {
	const before = await findProject(workspaceId, id);
	if (before.archivedAt) throw clientError(409, m.error_record_archived());
	await assertProjectRefs(workspaceId, data, before);
	const custom =
		data.custom === undefined
			? before.custom
			: await prepareCustom(
					workspaceId,
					"project",
					data.custom,
					before.custom,
					id,
				);
	const values = projectRow(data);
	const changes = {
		...changedFields(before, values),
		...customChanges(before.custom, custom),
	};
	if (!Object.keys(changes).length) return { id };
	const statusChanged = values.status !== before.status;
	await runBatch([
		db
			.update(project)
			.set({
				...values,
				custom: custom as Record<string, Json>,
				updatedAt: new Date(),
			})
			.where(and(eq(project.id, id), eq(project.workspaceId, workspaceId))),
		eventInsert(workspaceId, actor, {
			type: statusChanged ? "project.status_changed" : "project.updated",
			subjectType: "project",
			subjectId: id,
			payload: statusChanged
				? { from: before.status, to: values.status, changes }
				: { changes },
		}),
	]);
	return { id };
}

export async function setProjectArchived(
	workspaceId: string,
	actor: Actor,
	id: string,
	archived: boolean,
) {
	const before = await findProject(workspaceId, id);
	if (Boolean(before.archivedAt) === archived) return { id };
	// Still in the state read (two archives at once write one event); restoring
	// a deal's project while the deal has another active one hits the unique
	// index and is refused
	await runBatch([
		db
			.select({ id: project.id })
			.from(project)
			.where(and(eq(project.id, id), eq(project.workspaceId, workspaceId)))
			.for("update"),
		db
			.select({
				ok: sql<number>`1 / (case when exists (select 1 from "project" p where p."id" = ${id} and p."workspace_id" = ${workspaceId} and p."archived_at" is ${sql.raw(archived ? "null" : "not null")}) then 1 else 0 end)`,
			})
			.from(project)
			.where(and(eq(project.id, id), eq(project.workspaceId, workspaceId))),
		db
			.update(project)
			.set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
			.where(and(eq(project.id, id), eq(project.workspaceId, workspaceId))),
		eventInsert(workspaceId, actor, {
			type: archived ? "project.archived" : "project.restored",
			subjectType: "project",
			subjectId: id,
		}),
	]);
	return { id };
}

export async function relatedProjects(
	workspaceId: string,
	refs: { contactId?: string; companyId?: string; dealId?: string },
) {
	if (!refs.contactId && !refs.companyId && !refs.dealId) return [];
	return db
		.select(listColumns)
		.from(project)
		.where(
			and(
				eq(project.workspaceId, workspaceId),
				isNull(project.archivedAt),
				refs.contactId ? eq(project.contactId, refs.contactId) : undefined,
				refs.companyId ? eq(project.companyId, refs.companyId) : undefined,
				refs.dealId ? eq(project.dealId, refs.dealId) : undefined,
			),
		)
		.orderBy(desc(project.createdAt))
		.limit(50);
}
