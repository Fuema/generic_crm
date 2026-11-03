import {
	and,
	asc,
	count,
	desc,
	eq,
	gt,
	ilike,
	isNotNull,
	isNull,
	or,
	type SQL,
	sql,
	sum,
} from "drizzle-orm";
import { db } from "#/db/index";
import { company, contact, deal, pipeline, pipelineStage } from "#/db/schema";
import { assertWorkspaceRefs } from "#/lib/workspace-refs.server";
import {
	customChanges,
	listFields,
	prepareCustom,
} from "#/modules/fields/fields.server";
import { localized } from "#/modules/fields/schema";
import {
	errorCode,
	guard,
	listPipelines,
	lockPipelines,
} from "#/modules/pipelines/pipelines.server";
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
import {
	type DealInput,
	type DealSearch,
	dayToStored,
	lostReasonProblem,
} from "./schema";

// Server-only data layer for deals. Every function takes the workspace id
// first and filters by it; the server functions in deals.ts pass
// context.workspaceId from the session, never a value from input. Writes put
// the change and its events in one db.batch (spec §11.1). Writes that set a
// stage take the pipelines' per-workspace lock and check inside the batch that
// the stage is still active, so a deal can't land in a stage being removed.

function clientError(status: number, message: string) {
	return new Response(message, { status });
}

function likePattern(term: string) {
	return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

function page<T>(rows: T[], total: number, pageSize: number) {
	return { rows, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

// Correlated subqueries spell out table names (spec §17 pitfall 13)
const tagsOfDeal = sql<
	{ id: string; name: string; color: string }[]
>`(select coalesce(json_agg(json_build_object('id', t."id", 'name', t."name", 'color', t."color") order by t."name"), '[]'::json) from "record_tag" rt join "tag" t on t."id" = rt."tag_id" and t."workspace_id" = rt."workspace_id" where rt."subject_type" = 'deal' and rt."subject_id" = "deal"."id" and rt."workspace_id" = "deal"."workspace_id")`;

const hasTag = (tagId: string) =>
	sql`exists (select 1 from "record_tag" rt where rt."tag_id" = ${tagId} and rt."subject_type" = 'deal' and rt."subject_id" = "deal"."id" and rt."workspace_id" = "deal"."workspace_id")`;

const contactNameOfDeal = sql<string>`(select concat_ws(' ', c."first_name", c."last_name") from "contact" c where c."id" = "deal"."contact_id" and c."workspace_id" = "deal"."workspace_id")`;
const companyNameOfDeal = sql<
	string | null
>`(select co."name" from "company" co where co."id" = "deal"."company_id" and co."workspace_id" = "deal"."workspace_id")`;
const ownerNameOfDeal = sql<
	string | null
>`(select u."name" from "user" u where u."id" = "deal"."owner_id")`;
const stageNameOfDeal = sql<{
	en: string;
	es: string;
}>`(select s."name" from "pipeline_stage" s where s."id" = "deal"."stage_id" and s."workspace_id" = "deal"."workspace_id")`;

const DEAL_SORT = {
	name: deal.name,
	valueCents: deal.valueCents,
	expectedCloseAt: deal.expectedCloseAt,
	createdAt: deal.createdAt,
} as const;

const listColumns = {
	id: deal.id,
	name: deal.name,
	pipelineId: deal.pipelineId,
	stageId: deal.stageId,
	status: deal.status,
	valueCents: deal.valueCents,
	expectedCloseAt: deal.expectedCloseAt,
	contactId: deal.contactId,
	companyId: deal.companyId,
	ownerId: deal.ownerId,
	closedAt: deal.closedAt,
	custom: deal.custom,
	archivedAt: deal.archivedAt,
	createdAt: deal.createdAt,
	updatedAt: deal.updatedAt,
	contactName: contactNameOfDeal,
	companyName: companyNameOfDeal,
	ownerName: ownerNameOfDeal,
	stageName: stageNameOfDeal,
	tags: tagsOfDeal,
};

async function dealQuery(workspaceId: string, search: DealSearch) {
	const filters: SQL[] = [
		eq(deal.workspaceId, workspaceId),
		search.show === "archived"
			? isNotNull(deal.archivedAt)
			: isNull(deal.archivedAt),
	];
	if (search.q) {
		const pattern = likePattern(search.q);
		const match = or(
			ilike(deal.name, pattern),
			sql`${contactNameOfDeal} ilike ${pattern}`,
			sql`coalesce(${companyNameOfDeal}, '') ilike ${pattern}`,
		);
		if (match) filters.push(match);
	}
	if (search.status) filters.push(eq(deal.status, search.status));
	if (search.pipeline) filters.push(eq(deal.pipelineId, search.pipeline));
	if (search.tag) filters.push(hasTag(search.tag));
	const { fields } = await listFields(workspaceId, "deal", {
		includeArchived: false,
	});
	filters.push(...filterConditions("deal", search.filters, fields));
	const order = sortExpression(
		"deal",
		{ field: search.sort, dir: search.dir },
		fields,
		DEAL_SORT,
	);
	return { where: and(...filters), order };
}

export async function listDeals(workspaceId: string, search: DealSearch) {
	const { where, order } = await dealQuery(workspaceId, search);
	const [rows, [{ total, value }]] = await Promise.all([
		db
			.select(listColumns)
			.from(deal)
			.where(where)
			.orderBy(order, asc(deal.id))
			.limit(search.pageSize)
			.offset((search.page - 1) * search.pageSize),
		db
			.select({ total: count(), value: sum(deal.valueCents) })
			.from(deal)
			.where(where),
	]);
	return {
		...page(rows, total, search.pageSize),
		totalValueCents: Number(value ?? 0),
	};
}
export type DealListRow = Awaited<ReturnType<typeof listDeals>>["rows"][number];

// The board of one pipeline: open deals, plus deals won or lost in the last
// 90 days, with the same search and filters as the list (at most 500 cards)
export const BOARD_LIMIT = 500;
export async function listBoard(
	workspaceId: string,
	pipelineId: string,
	search: DealSearch,
) {
	const { where, order } = await dealQuery(workspaceId, {
		...search,
		pipeline: pipelineId,
		show: "active",
	});
	const recent = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
	const rows = await db
		.select(listColumns)
		.from(deal)
		.where(and(where, or(eq(deal.status, "open"), gt(deal.closedAt, recent))))
		.orderBy(order, asc(deal.id))
		.limit(BOARD_LIMIT);
	return { rows, truncated: rows.length >= BOARD_LIMIT };
}

async function findDeal(workspaceId: string, id: string) {
	const [row] = await db
		.select()
		.from(deal)
		.where(and(eq(deal.id, id), eq(deal.workspaceId, workspaceId)))
		.limit(1);
	if (!row) throw clientError(404, m.error_deal_not_found());
	return row;
}

export async function getDealDetail(workspaceId: string, id: string) {
	const row = await findDeal(workspaceId, id);
	const [[names], pipelines] = await Promise.all([
		db
			.select({
				contactName: contactNameOfDeal,
				companyName: companyNameOfDeal,
				ownerName: ownerNameOfDeal,
				stageName: stageNameOfDeal,
				pipelineName: sql<{
					en: string;
					es: string;
				}>`(select p."name" from "pipeline" p where p."id" = "deal"."pipeline_id" and p."workspace_id" = "deal"."workspace_id")`,
			})
			.from(deal)
			.where(and(eq(deal.id, id), eq(deal.workspaceId, workspaceId))),
		listPipelines(workspaceId, { includeArchived: true }),
	]);
	return {
		deal: row,
		...names,
		pipeline: pipelines.find((p) => p.id === row.pipelineId) ?? null,
	};
}

// The stage a deal is put in: an active stage of an active pipeline of this
// workspace, as given (the pipeline must match)
async function findStage(
	workspaceId: string,
	pipelineId: string,
	stageId: string,
) {
	const [row] = await db
		.select({
			id: pipelineStage.id,
			type: pipelineStage.type,
			name: pipelineStage.name,
			archivedAt: pipelineStage.archivedAt,
			pipelineArchivedAt: pipeline.archivedAt,
		})
		.from(pipelineStage)
		.innerJoin(
			pipeline,
			and(
				eq(pipeline.id, pipelineStage.pipelineId),
				eq(pipeline.workspaceId, pipelineStage.workspaceId),
			),
		)
		.where(
			and(
				eq(pipelineStage.id, stageId),
				eq(pipelineStage.pipelineId, pipelineId),
				eq(pipelineStage.workspaceId, workspaceId),
			),
		)
		.limit(1);
	if (!row) throw clientError(400, m.error_choose_stage());
	return row;
}

// Contact, company and owner are checked when set or changed: an unchanged
// owner who left, or an unchanged archived company, doesn't block an edit
async function assertDealRefs(
	workspaceId: string,
	data: DealInput,
	before?: {
		contactId: string;
		companyId: string | null;
		ownerId: string | null;
	},
) {
	const checks: Promise<unknown>[] = [];
	if (data.contactId !== before?.contactId) {
		checks.push(
			db
				.select({ id: contact.id })
				.from(contact)
				.where(
					and(
						eq(contact.id, data.contactId),
						eq(contact.workspaceId, workspaceId),
						isNull(contact.archivedAt),
					),
				)
				.limit(1)
				.then(([row]) => {
					if (!row) throw clientError(400, m.error_choose_contact());
				}),
		);
	}
	const companyId = data.companyId || null;
	if (companyId && companyId !== (before?.companyId ?? null)) {
		checks.push(
			db
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
				.then(([row]) => {
					if (!row) throw clientError(400, m.error_choose_company());
				}),
		);
	}
	const ownerId = data.ownerId || null;
	if (ownerId && ownerId !== (before?.ownerId ?? null))
		checks.push(assertWorkspaceRefs(workspaceId, { userId: ownerId }));
	await Promise.all(checks);
}

// What a stage means for the deal: its status, when it closed, the lost reason
function stageEffect(
	stageType: string,
	lostReason: string,
	before?: { status: string; closedAt: Date | null },
) {
	const status = stageType as "open" | "won" | "lost";
	return {
		status,
		closedAt:
			status === "open"
				? null
				: before && before.status === status
					? before.closedAt
					: new Date(),
		lostReason: status === "lost" ? lostReason.trim() : null,
	};
}

const isActiveStage = (
	workspaceId: string,
	pipelineId: string,
	stageId: string,
) =>
	sql`exists (select 1 from "pipeline_stage" s join "pipeline" p on p."id" = s."pipeline_id" and p."workspace_id" = s."workspace_id" where s."id" = ${stageId} and s."pipeline_id" = ${pipelineId} and s."workspace_id" = ${workspaceId} and s."archived_at" is null and p."archived_at" is null)`;

// The deal is still active and in the stage it was read in (checked under the
// pipelines' lock, so two moves or an edit and a move can't both win)
const dealStillIn = (workspaceId: string, id: string, stageId: string) =>
	sql`exists (select 1 from "deal" d where d."id" = ${id} and d."workspace_id" = ${workspaceId} and d."stage_id" = ${stageId} and d."archived_at" is null)`;

// A contact being merged away (archived) at this moment can't get a deal
const contactActive = (workspaceId: string, contactId: string) =>
	sql`exists (select 1 from "contact" c where c."id" = ${contactId} and c."workspace_id" = ${workspaceId} and c."archived_at" is null)`;

// Events for a change of stage: the move, and won / lost / reopened
function stageEvents(
	workspaceId: string,
	actor: Actor,
	id: string,
	from: {
		stageId: string;
		status: string;
		name: { en: string; es: string } | null;
	},
	to: {
		stageId: string;
		status: string;
		name: { en: string; es: string };
		lostReason: string | null;
	},
) {
	const events = [
		eventInsert(workspaceId, actor, {
			type: "deal.stage_changed",
			subjectType: "deal",
			subjectId: id,
			payload: {
				from: from.stageId,
				to: to.stageId,
				fromName: from.name ? localized(from.name) : null,
				toName: localized(to.name),
			},
		}),
	];
	if (to.status !== from.status) {
		events.push(
			eventInsert(workspaceId, actor, {
				type:
					to.status === "won"
						? "deal.won"
						: to.status === "lost"
							? "deal.lost"
							: "deal.reopened",
				subjectType: "deal",
				subjectId: id,
				payload: to.status === "lost" ? { reason: to.lostReason } : {},
			}),
		);
	}
	return events;
}

// Statements built conditionally; db.batch's tuple type can't follow the spreads
async function runBatch(statements: unknown[]) {
	try {
		await db.batch(statements as unknown as Parameters<typeof db.batch>[0]);
	} catch (error) {
		if (errorCode(error) === "22012")
			throw clientError(409, m.error_deal_changed());
		throw error;
	}
}

function dealRow(data: DealInput) {
	return {
		name: data.name,
		pipelineId: data.pipelineId,
		stageId: data.stageId,
		valueCents: data.valueCents,
		expectedCloseAt: dayToStored(data.expectedClose),
		contactId: data.contactId,
		companyId: data.companyId || null,
		ownerId: data.ownerId || null,
	};
}

export async function createDeal(
	workspaceId: string,
	actor: Actor,
	data: DealInput,
) {
	const [stage] = await Promise.all([
		findStage(workspaceId, data.pipelineId, data.stageId),
		assertDealRefs(workspaceId, data),
	]);
	if (stage.archivedAt || stage.pipelineArchivedAt)
		throw clientError(400, m.error_choose_stage());
	const problem = lostReasonProblem(stage.type, data.lostReason);
	if (problem) throw clientError(400, problem);
	const custom = await prepareCustom(workspaceId, "deal", data.custom ?? {});
	const id = uuidv7();
	const effect = stageEffect(stage.type, data.lostReason);
	await runBatch([
		lockPipelines(workspaceId),
		guard(
			workspaceId,
			sql`${isActiveStage(workspaceId, data.pipelineId, data.stageId)} and ${contactActive(workspaceId, data.contactId)}`,
		),
		db.insert(deal).values({
			id,
			workspaceId,
			...dealRow(data),
			...effect,
			custom,
		}),
		eventInsert(workspaceId, actor, {
			type: "deal.created",
			subjectType: "deal",
			subjectId: id,
			payload: { stage: localized(stage.name), status: effect.status },
		}),
	]);
	return { id };
}

export async function updateDeal(
	workspaceId: string,
	actor: Actor,
	id: string,
	data: DealInput,
) {
	const before = await findDeal(workspaceId, id);
	if (before.archivedAt) throw clientError(409, m.error_record_archived());
	const stageChanged =
		data.stageId !== before.stageId || data.pipelineId !== before.pipelineId;
	const [stage] = await Promise.all([
		findStage(workspaceId, data.pipelineId, data.stageId),
		assertDealRefs(workspaceId, data, before),
	]);
	// A deal may stay in a stage that was archived since; it can't move into one
	if (stageChanged && (stage.archivedAt || stage.pipelineArchivedAt))
		throw clientError(400, m.error_choose_stage());
	const problem = lostReasonProblem(stage.type, data.lostReason);
	if (problem) throw clientError(400, problem);
	const custom =
		data.custom === undefined
			? before.custom
			: await prepareCustom(
					workspaceId,
					"deal",
					data.custom,
					before.custom,
					id,
				);
	const effect = stageEffect(stage.type, data.lostReason, before);
	const values = { ...dealRow(data), ...effect };
	const changes = {
		...changedFields(before, {
			name: values.name,
			valueCents: values.valueCents,
			expectedCloseAt: values.expectedCloseAt,
			contactId: values.contactId,
			companyId: values.companyId,
			ownerId: values.ownerId,
			lostReason: values.lostReason,
		}),
		...customChanges(before.custom, custom),
	};
	if (!Object.keys(changes).length && !stageChanged) return { id };
	const beforeStage = stageChanged
		? await db
				.select({ name: pipelineStage.name })
				.from(pipelineStage)
				.where(
					and(
						eq(pipelineStage.id, before.stageId),
						eq(pipelineStage.workspaceId, workspaceId),
					),
				)
				.then((r) => r[0]?.name ?? null)
		: null;
	const conditions = [dealStillIn(workspaceId, id, before.stageId)];
	if (stageChanged)
		conditions.push(isActiveStage(workspaceId, data.pipelineId, data.stageId));
	if (data.contactId !== before.contactId)
		conditions.push(contactActive(workspaceId, data.contactId));
	await runBatch([
		lockPipelines(workspaceId),
		guard(workspaceId, sql.join(conditions, sql` and `)),
		db
			.update(deal)
			.set({
				...values,
				custom: custom as Record<string, Json>,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(deal.id, id),
					eq(deal.workspaceId, workspaceId),
					eq(deal.stageId, before.stageId),
				),
			),
		...(Object.keys(changes).length
			? [
					eventInsert(workspaceId, actor, {
						type: "deal.updated",
						subjectType: "deal",
						subjectId: id,
						payload: { changes },
					}),
				]
			: []),
		...(stageChanged
			? stageEvents(
					workspaceId,
					actor,
					id,
					{ stageId: before.stageId, status: before.status, name: beforeStage },
					{
						stageId: data.stageId,
						status: effect.status,
						name: stage.name,
						lostReason: effect.lostReason,
					},
				)
			: []),
	]);
	return { id };
}

// Moves a deal to another stage of its pipeline (board, record page)
export async function moveDeal(
	workspaceId: string,
	actor: Actor,
	input: { id: string; stageId: string; lostReason: string },
) {
	const before = await findDeal(workspaceId, input.id);
	if (before.archivedAt) throw clientError(409, m.error_record_archived());
	if (before.stageId === input.stageId) return { id: input.id };
	const stage = await findStage(workspaceId, before.pipelineId, input.stageId);
	if (stage.archivedAt || stage.pipelineArchivedAt)
		throw clientError(400, m.error_choose_stage());
	const problem = lostReasonProblem(stage.type, input.lostReason);
	if (problem) throw clientError(400, problem);
	const effect = stageEffect(stage.type, input.lostReason, before);
	const [beforeStage] = await db
		.select({ name: pipelineStage.name })
		.from(pipelineStage)
		.where(
			and(
				eq(pipelineStage.id, before.stageId),
				eq(pipelineStage.workspaceId, workspaceId),
			),
		);
	await runBatch([
		lockPipelines(workspaceId),
		guard(
			workspaceId,
			sql`${isActiveStage(workspaceId, before.pipelineId, input.stageId)} and ${dealStillIn(workspaceId, input.id, before.stageId)}`,
		),
		db
			.update(deal)
			.set({ stageId: input.stageId, ...effect, updatedAt: new Date() })
			.where(
				and(
					eq(deal.id, input.id),
					eq(deal.workspaceId, workspaceId),
					eq(deal.stageId, before.stageId),
				),
			),
		...stageEvents(
			workspaceId,
			actor,
			input.id,
			{
				stageId: before.stageId,
				status: before.status,
				name: beforeStage?.name ?? null,
			},
			{
				stageId: input.stageId,
				status: effect.status,
				name: stage.name,
				lostReason: effect.lostReason,
			},
		),
	]);
	return { id: input.id };
}

export async function setDealArchived(
	workspaceId: string,
	actor: Actor,
	id: string,
	archived: boolean,
) {
	const before = await findDeal(workspaceId, id);
	if (Boolean(before.archivedAt) === archived) return { id };
	// A deal comes back only into a stage that still exists: removing a stage
	// skips archived deals, and an active deal in a removed stage would block
	// every later save of the pipeline
	if (!archived) {
		const stage = await findStage(
			workspaceId,
			before.pipelineId,
			before.stageId,
		);
		if (stage.archivedAt || stage.pipelineArchivedAt)
			throw clientError(409, m.error_deal_restore_stage());
	}
	await runBatch([
		...(archived
			? []
			: [
					lockPipelines(workspaceId),
					guard(
						workspaceId,
						isActiveStage(workspaceId, before.pipelineId, before.stageId),
					),
				]),
		db
			.update(deal)
			.set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
			.where(and(eq(deal.id, id), eq(deal.workspaceId, workspaceId))),
		eventInsert(workspaceId, actor, {
			type: archived ? "deal.archived" : "deal.restored",
			subjectType: "deal",
			subjectId: id,
		}),
	]);
	return { id };
}

// The deals of one contact or company, newest first (record pages)
export async function relatedDeals(
	workspaceId: string,
	refs: { contactId?: string; companyId?: string },
) {
	if (!refs.contactId && !refs.companyId) return [];
	return db
		.select(listColumns)
		.from(deal)
		.where(
			and(
				eq(deal.workspaceId, workspaceId),
				isNull(deal.archivedAt),
				refs.contactId ? eq(deal.contactId, refs.contactId) : undefined,
				refs.companyId ? eq(deal.companyId, refs.companyId) : undefined,
			),
		)
		.orderBy(desc(deal.createdAt))
		.limit(50);
}

// Active contacts for the deal form's contact picker
export async function searchContacts(workspaceId: string, q: string) {
	const filters: SQL[] = [
		eq(contact.workspaceId, workspaceId),
		isNull(contact.archivedAt),
	];
	if (q) {
		const pattern = likePattern(q);
		const match = or(
			ilike(contact.firstName, pattern),
			ilike(contact.lastName, pattern),
			ilike(contact.email, pattern),
			sql`(${contact.firstName} || ' ' || coalesce(${contact.lastName}, '')) ilike ${pattern}`,
		);
		if (match) filters.push(match);
	}
	return db
		.select({
			id: contact.id,
			firstName: contact.firstName,
			lastName: contact.lastName,
			email: contact.email,
			companyId: contact.companyId,
		})
		.from(contact)
		.where(and(...filters))
		.orderBy(asc(contact.firstName), asc(contact.lastName))
		.limit(10);
}
