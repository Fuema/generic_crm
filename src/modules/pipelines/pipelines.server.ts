import {
	and,
	asc,
	count,
	eq,
	inArray,
	isNull,
	ne,
	notInArray,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import { db } from "#/db/index";
import { deal, organization, pipeline, pipelineStage } from "#/db/schema";
import { keyFromLabel, type Localized } from "#/modules/fields/schema";
import { m } from "#/paraglide/messages.js";
import { type Actor, eventInsert } from "#/platform/events.server";
import { uuidv7 } from "#/platform/ids";
import {
	normalizedProbability,
	PIPELINE_LIMITS,
	type PipelineInput,
	type PipelineStage,
	type StageType,
	stagesProblem,
	type UpdatePipelineInput,
} from "./schema";

// Server-only data layer for pipelines and their stages. Every function takes
// the workspace id first and filters by it; writes put the change and its event
// in one db.batch (spec §11.1). Stages are archived, never deleted: deals
// (phase 2 step 2) point to them.

function clientError(status: number, message: string) {
	return new Response(message, { status });
}

export type PipelineWithStages = {
	id: string;
	key: string;
	name: Localized;
	position: number;
	archivedAt: Date | null;
	stages: PipelineStage[];
};

// Pipelines in order, each with its active stages in order
export async function listPipelines(
	workspaceId: string,
	options: { includeArchived: boolean },
): Promise<PipelineWithStages[]> {
	const [pipelines, stages] = await Promise.all([
		db
			.select({
				id: pipeline.id,
				key: pipeline.key,
				name: pipeline.name,
				position: pipeline.position,
				archivedAt: pipeline.archivedAt,
			})
			.from(pipeline)
			.where(
				and(
					eq(pipeline.workspaceId, workspaceId),
					options.includeArchived ? undefined : isNull(pipeline.archivedAt),
				),
			)
			.orderBy(asc(pipeline.position), asc(pipeline.createdAt)),
		db
			.select({
				id: pipelineStage.id,
				pipelineId: pipelineStage.pipelineId,
				name: pipelineStage.name,
				position: pipelineStage.position,
				probability: pipelineStage.probability,
				type: pipelineStage.type,
			})
			.from(pipelineStage)
			.where(
				and(
					eq(pipelineStage.workspaceId, workspaceId),
					isNull(pipelineStage.archivedAt),
				),
			)
			.orderBy(asc(pipelineStage.position), asc(pipelineStage.createdAt)),
	]);
	return pipelines.map((p) => ({
		...p,
		stages: stages
			.filter((s) => s.pipelineId === p.id)
			.map(({ pipelineId: _, ...s }) => ({ ...s, type: s.type as StageType })),
	}));
}

async function findPipeline(workspaceId: string, id: string) {
	const [row] = await db
		.select()
		.from(pipeline)
		.where(and(eq(pipeline.id, id), eq(pipeline.workspaceId, workspaceId)))
		.limit(1);
	if (!row) throw clientError(404, m.error_pipeline_not_found());
	return row;
}

async function activeCount(workspaceId: string) {
	const [{ n }] = await db
		.select({ n: count() })
		.from(pipeline)
		.where(
			and(eq(pipeline.workspaceId, workspaceId), isNull(pipeline.archivedAt)),
		);
	return n;
}

// Concurrency: every pipeline write takes a per-workspace lock as the first
// statement of its batch, then re-checks its preconditions with guard(). A
// failed guard divides by zero, which rolls back the whole batch (change and
// event alike); runBatch turns that into a 409. Checks before the batch only
// give friendlier messages.
export const lockPipelines = (workspaceId: string) =>
	db
		.select({
			locked: sql`pg_advisory_xact_lock(hashtext(${`pipeline:${workspaceId}`}))::text`,
		})
		.from(organization)
		.where(eq(organization.id, workspaceId));

export const guard = (workspaceId: string, condition: SQL) =>
	db
		.select({ ok: sql<number>`1 / (case when ${condition} then 1 else 0 end)` })
		.from(organization)
		.where(eq(organization.id, workspaceId));

const activePipelines = (workspaceId: string) =>
	sql`(select count(*) from "pipeline" p where p."workspace_id" = ${workspaceId} and p."archived_at" is null)`;

const isActivePipeline = (workspaceId: string, id: string) =>
	sql`exists (select 1 from "pipeline" p where p."id" = ${id} and p."workspace_id" = ${workspaceId} and p."archived_at" is null)`;

export function errorCode(error: unknown) {
	const e = error as { code?: string; cause?: { code?: string } };
	return e?.code ?? e?.cause?.code;
}

type BatchItems = Parameters<typeof db.batch>[0];

async function runBatch(statements: BatchItems) {
	try {
		await db.batch(statements);
	} catch (error) {
		const code = errorCode(error);
		if (code === "22012") throw clientError(409, m.error_pipeline_changed());
		// The same key created by a concurrent request (e.g. a template run twice)
		if (code === "23505") throw clientError(409, m.error_pipeline_exists());
		throw error;
	}
}

function assertStages(stages: { type: StageType }[]) {
	const problem = stagesProblem(stages);
	if (problem) throw clientError(400, problem);
}

const stageRow = (
	workspaceId: string,
	pipelineId: string,
	stage: { name: Localized; probability: number; type: StageType },
	position: number,
) => ({
	id: uuidv7(),
	workspaceId,
	pipelineId,
	name: stage.name,
	position,
	probability: normalizedProbability(stage),
	type: stage.type,
});

// Creates a pipeline with its stages. `key` is given by templates ("sales");
// otherwise it comes from the name, with a suffix when taken.
export async function createPipeline(
	workspaceId: string,
	actor: Actor,
	input: PipelineInput,
	key?: string,
) {
	assertStages(input.stages);
	if ((await activeCount(workspaceId)) >= PIPELINE_LIMITS.pipelinesPerWorkspace)
		throw clientError(
			409,
			m.error_pipeline_limit({ max: PIPELINE_LIMITS.pipelinesPerWorkspace }),
		);
	const taken = await db
		.select({ key: pipeline.key })
		.from(pipeline)
		.where(eq(pipeline.workspaceId, workspaceId));
	const keys = new Set(taken.map((r) => r.key));
	let finalKey = key ?? keyFromLabel(input.name);
	if (key && keys.has(key)) throw clientError(409, m.error_pipeline_exists());
	for (let i = 2; keys.has(finalKey); i++)
		finalKey = `${keyFromLabel(input.name)}_${i}`;

	const id = uuidv7();
	const stages = input.stages.map((s, i) => stageRow(workspaceId, id, s, i));
	await runBatch([
		lockPipelines(workspaceId),
		guard(
			workspaceId,
			sql`${activePipelines(workspaceId)} < ${PIPELINE_LIMITS.pipelinesPerWorkspace}`,
		),
		db.insert(pipeline).values({
			id,
			workspaceId,
			key: finalKey,
			name: input.name,
			position: sql`(select coalesce(max(p."position"), -1) + 1 from "pipeline" p where p."workspace_id" = ${workspaceId})`,
		}),
		db.insert(pipelineStage).values(stages),
		eventInsert(workspaceId, actor, {
			type: "pipeline.created",
			subjectType: "pipeline",
			subjectId: id,
			payload: { key: finalKey, stages: stages.length },
		}),
	]);
	return { id, key: finalKey };
}

// Saves the pipeline's name and its whole ordered stage list: listed stages
// with an id are updated, those without one are added, and active stages left
// out are archived.
export async function updatePipeline(
	workspaceId: string,
	actor: Actor,
	input: UpdatePipelineInput,
) {
	assertStages(input.stages);
	const before = await findPipeline(workspaceId, input.id);
	if (before.archivedAt) throw clientError(409, m.error_record_archived());
	const current = await db
		.select({ id: pipelineStage.id })
		.from(pipelineStage)
		.where(
			and(
				eq(pipelineStage.workspaceId, workspaceId),
				eq(pipelineStage.pipelineId, input.id),
				isNull(pipelineStage.archivedAt),
			),
		);
	const currentIds = new Set(current.map((s) => s.id));
	const keptIds = input.stages.map((s) => s.id).filter(Boolean);
	// Ids must be this pipeline's active stages, each listed once
	if (
		keptIds.some((id) => !currentIds.has(id)) ||
		new Set(keptIds).size !== keptIds.length
	)
		throw clientError(400, m.validation_invalid_id());
	const removed = [...currentIds].filter((id) => !keptIds.includes(id));
	// A stage that holds deals keeps its type: deal status mirrors it
	const typeChecks = input.stages
		.filter((s) => s.id)
		.map((s) => sql`(d."stage_id" = ${s.id} and d."status" <> ${s.type})`);
	const kept = input.stages.filter((s) => s.id);
	if (kept.length) {
		const [{ n }] = await db
			.select({ n: count() })
			.from(deal)
			.where(
				and(
					eq(deal.workspaceId, workspaceId),
					eq(deal.pipelineId, input.id),
					isNull(deal.archivedAt),
					or(
						...kept.map((s) =>
							and(eq(deal.stageId, s.id), ne(deal.status, s.type)),
						),
					),
				),
			);
		if (n > 0) throw clientError(409, m.error_stage_type_has_deals());
	}
	// A stage that still holds deals (open or closed) can't be removed
	if (removed.length) {
		const [{ n }] = await db
			.select({ n: count() })
			.from(deal)
			.where(
				and(
					eq(deal.workspaceId, workspaceId),
					eq(deal.pipelineId, input.id),
					isNull(deal.archivedAt),
					inArray(deal.stageId, removed),
				),
			);
		if (n > 0) throw clientError(409, m.error_stage_has_deals());
	}
	const keptList = keptIds.length
		? sql.join(
				keptIds.map((id) => sql`${id}`),
				sql`, `,
			)
		: null;

	const now = new Date();
	const added = input.stages
		.map((s, i) => ({ s, i }))
		.filter(({ s }) => !s.id)
		.map(({ s, i }) => stageRow(workspaceId, input.id, s, i));
	await runBatch([
		lockPipelines(workspaceId),
		// Still active, and every listed id still one of its active stages
		guard(
			workspaceId,
			keptList
				? sql`${isActivePipeline(workspaceId, input.id)} and (select count(*) from "pipeline_stage" s where s."workspace_id" = ${workspaceId} and s."pipeline_id" = ${input.id} and s."archived_at" is null and s."id" in (${keptList})) = ${keptIds.length}`
				: isActivePipeline(workspaceId, input.id),
		),
		// The same, inside the transaction (a deal moved in meanwhile): no active
		// deal in a stage this save archives, and none in a stage whose type it
		// changes (deal status mirrors the stage type)
		guard(
			workspaceId,
			sql`not exists (select 1 from "deal" d where d."workspace_id" = ${workspaceId} and d."pipeline_id" = ${input.id} and d."archived_at" is null and (d."stage_id" in (select s."id" from "pipeline_stage" s where s."workspace_id" = ${workspaceId} and s."pipeline_id" = ${input.id} and s."archived_at" is null and s."id" not in (${keptList ?? sql`''`}))${typeChecks.length ? sql` or ${sql.join(typeChecks, sql` or `)}` : sql``}))`,
		),
		db
			.update(pipeline)
			.set({ name: input.name, updatedAt: now })
			.where(
				and(eq(pipeline.id, input.id), eq(pipeline.workspaceId, workspaceId)),
			),
		...input.stages
			.map((s, i) => ({ s, i }))
			.filter(({ s }) => s.id)
			.map(({ s, i }) =>
				db
					.update(pipelineStage)
					.set({
						name: s.name,
						position: i,
						probability: normalizedProbability(s),
						type: s.type,
						updatedAt: now,
					})
					.where(
						and(
							eq(pipelineStage.id, s.id),
							eq(pipelineStage.workspaceId, workspaceId),
							eq(pipelineStage.pipelineId, input.id),
						),
					),
			),
		...(added.length ? [db.insert(pipelineStage).values(added)] : []),
		// Every other active stage is archived, so the pipeline ends up with
		// exactly the saved list, whatever another save did meanwhile
		db
			.update(pipelineStage)
			.set({ archivedAt: now, updatedAt: now })
			.where(
				and(
					eq(pipelineStage.workspaceId, workspaceId),
					eq(pipelineStage.pipelineId, input.id),
					isNull(pipelineStage.archivedAt),
					notInArray(pipelineStage.id, [...keptIds, ...added.map((a) => a.id)]),
				),
			),
		eventInsert(workspaceId, actor, {
			type: "pipeline.updated",
			subjectType: "pipeline",
			subjectId: input.id,
			payload: { stagesAdded: added.length, stagesArchived: removed.length },
		}),
	]);
	return { id: input.id };
}

// Archiving keeps the pipeline and its stages; a workspace keeps at least one
// active pipeline
export async function setPipelineArchived(
	workspaceId: string,
	actor: Actor,
	id: string,
	archived: boolean,
) {
	const before = await findPipeline(workspaceId, id);
	if (Boolean(before.archivedAt) === archived) return { id };
	const active = await activeCount(workspaceId);
	if (archived && active <= 1) throw clientError(409, m.error_pipeline_last());
	if (archived) {
		const [{ n }] = await db
			.select({ n: count() })
			.from(deal)
			.where(
				and(
					eq(deal.workspaceId, workspaceId),
					eq(deal.pipelineId, id),
					isNull(deal.archivedAt),
					eq(deal.status, "open"),
				),
			);
		if (n > 0) throw clientError(409, m.error_pipeline_has_deals());
	}
	if (!archived && active >= PIPELINE_LIMITS.pipelinesPerWorkspace)
		throw clientError(
			409,
			m.error_pipeline_limit({ max: PIPELINE_LIMITS.pipelinesPerWorkspace }),
		);
	await runBatch([
		lockPipelines(workspaceId),
		// Archive: still active and not the last one. Restore: still archived
		// and under the limit.
		guard(
			workspaceId,
			archived
				? sql`${isActivePipeline(workspaceId, id)} and ${activePipelines(workspaceId)} > 1 and not exists (select 1 from "deal" d where d."workspace_id" = ${workspaceId} and d."pipeline_id" = ${id} and d."archived_at" is null and d."status" = 'open')`
				: sql`not ${isActivePipeline(workspaceId, id)} and ${activePipelines(workspaceId)} < ${PIPELINE_LIMITS.pipelinesPerWorkspace}`,
		),
		db
			.update(pipeline)
			.set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
			.where(and(eq(pipeline.id, id), eq(pipeline.workspaceId, workspaceId))),
		eventInsert(workspaceId, actor, {
			type: archived ? "pipeline.archived" : "pipeline.restored",
			subjectType: "pipeline",
			subjectId: id,
		}),
	]);
	return { id };
}
