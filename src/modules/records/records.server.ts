import { and, asc, count, desc, eq, or, type SQL, sql } from "drizzle-orm";
import { db } from "#/db/index";
import {
	company,
	contact,
	deal,
	event,
	invoice,
	note,
	project,
	quote,
	recordTag,
	salesOrder,
	tag,
	user,
} from "#/db/schema";
import { m } from "#/paraglide/messages.js";
import { type Actor, eventInsert } from "#/platform/events.server";
import { uuidv7 } from "#/platform/ids";
import { LIMITS, type SubjectType, TAG_COLORS } from "./schema";

// Server-only data layer for tags, notes and the timeline of any record. Every
// function takes the workspace id first; writes put the change and its event in
// one db.batch. Events about tags and notes have the record as their subject, so
// they appear on its timeline.

function clientError(status: number, message: string) {
	return new Response(message, { status });
}

const SUBJECT_TABLES = {
	contact,
	company,
	deal,
	quote,
	order: salesOrder,
	invoice,
	project,
} as const;

// The record must exist in this workspace; writes also need it not archived
async function assertSubject(
	workspaceId: string,
	subjectType: SubjectType,
	subjectId: string,
	{ writable }: { writable: boolean },
) {
	const table = SUBJECT_TABLES[subjectType];
	const [row] = await db
		.select({ archivedAt: table.archivedAt })
		.from(table)
		.where(and(eq(table.id, subjectId), eq(table.workspaceId, workspaceId)))
		.limit(1);
	if (!row) {
		throw clientError(
			404,
			subjectType === "contact"
				? m.error_contact_not_found()
				: subjectType === "company"
					? m.error_company_not_found()
					: subjectType === "deal"
						? m.error_deal_not_found()
						: subjectType === "quote"
							? m.error_quote_not_found()
							: subjectType === "order"
								? m.error_order_not_found()
								: subjectType === "invoice"
									? m.error_invoice_not_found()
									: m.error_project_not_found(),
		);
	}
	if (writable && row.archivedAt) {
		throw clientError(409, m.error_record_archived());
	}
}

// A stable color per name, so a new tag doesn't need a color picker
export function colorFor(name: string) {
	let hash = 0;
	for (const ch of name.toLowerCase())
		hash = (hash * 31 + ch.charCodeAt(0)) | 0;
	return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

// ------------------------------------------------------------------- tags

export async function listWorkspaceTags(workspaceId: string) {
	return db
		.select({ id: tag.id, name: tag.name, color: tag.color })
		.from(tag)
		.where(eq(tag.workspaceId, workspaceId))
		.orderBy(asc(tag.name));
}

async function recordTags(
	workspaceId: string,
	subjectType: SubjectType,
	subjectId: string,
) {
	return db
		.select({ id: tag.id, name: tag.name, color: tag.color })
		.from(recordTag)
		.innerJoin(
			tag,
			and(eq(tag.id, recordTag.tagId), eq(tag.workspaceId, workspaceId)),
		)
		.where(
			and(
				eq(recordTag.workspaceId, workspaceId),
				eq(recordTag.subjectType, subjectType),
				eq(recordTag.subjectId, subjectId),
			),
		)
		.orderBy(asc(tag.name));
}

export async function addTag(
	workspaceId: string,
	actor: Actor,
	input: { subjectType: SubjectType; subjectId: string; name: string },
) {
	const { subjectType, subjectId, name } = input;
	await assertSubject(workspaceId, subjectType, subjectId, { writable: true });

	const findTag = () =>
		db
			.select({ id: tag.id, name: tag.name })
			.from(tag)
			.where(
				and(
					eq(tag.workspaceId, workspaceId),
					sql`lower(${tag.name}) = ${name.toLowerCase()}`,
				),
			)
			.limit(1)
			.then((r) => r[0]);

	let existing = await findTag();
	if (!existing) {
		const [{ total }] = await db
			.select({ total: count() })
			.from(tag)
			.where(eq(tag.workspaceId, workspaceId));
		if (total >= LIMITS.tagsPerWorkspace) {
			throw clientError(
				409,
				m.error_tag_workspace_limit({ max: LIMITS.tagsPerWorkspace }),
			);
		}
		// A concurrent request may create the same name: keep whichever won
		await db
			.insert(tag)
			.values({ id: uuidv7(), workspaceId, name, color: colorFor(name) })
			.onConflictDoNothing();
		existing = await findTag();
	}
	if (!existing) throw clientError(409, m.error_generic());

	const current = await recordTags(workspaceId, subjectType, subjectId);
	if (current.some((t) => t.id === existing.id)) return { tagId: existing.id };
	if (current.length >= LIMITS.tagsPerRecord) {
		throw clientError(
			409,
			m.error_tag_record_limit({ max: LIMITS.tagsPerRecord }),
		);
	}
	try {
		await db.batch([
			db.insert(recordTag).values({
				workspaceId,
				tagId: existing.id,
				subjectType,
				subjectId,
				createdById: actor.type === "member" ? actor.id : null,
			}),
			eventInsert(workspaceId, actor, {
				type: `${subjectType}.tag_added`,
				subjectType,
				subjectId,
				payload: { tagId: existing.id, name: existing.name },
			}),
		]);
	} catch (error) {
		// The same tag added by a concurrent request: the batch (and its event)
		// rolled back, and the record already has the tag
		const e = error as { code?: string; cause?: { code?: string } };
		if (e?.code !== "23505" && e?.cause?.code !== "23505") throw error;
	}
	return { tagId: existing.id };
}

export async function removeTag(
	workspaceId: string,
	actor: Actor,
	input: { subjectType: SubjectType; subjectId: string; tagId: string },
) {
	const { subjectType, subjectId, tagId } = input;
	await assertSubject(workspaceId, subjectType, subjectId, { writable: true });
	const current = await recordTags(workspaceId, subjectType, subjectId);
	const linked = current.find((t) => t.id === tagId);
	if (!linked) return { tagId };
	await db.batch([
		db
			.delete(recordTag)
			.where(
				and(
					eq(recordTag.workspaceId, workspaceId),
					eq(recordTag.tagId, tagId),
					eq(recordTag.subjectType, subjectType),
					eq(recordTag.subjectId, subjectId),
				),
			),
		// Runs after the unlink in the same transaction
		db
			.delete(tag)
			.where(
				and(
					eq(tag.id, tagId),
					eq(tag.workspaceId, workspaceId),
					sql`not exists (select 1 from "record_tag" rt where rt."tag_id" = ${tagId})`,
				),
			),
		eventInsert(workspaceId, actor, {
			type: `${subjectType}.tag_removed`,
			subjectType,
			subjectId,
			payload: { tagId, name: linked.name },
		}),
	]);
	return { tagId };
}

// ------------------------------------------------------------------ notes

async function findNote(workspaceId: string, id: string) {
	const [row] = await db
		.select()
		.from(note)
		.where(and(eq(note.id, id), eq(note.workspaceId, workspaceId)))
		.limit(1);
	if (!row) throw clientError(404, m.error_note_not_found());
	return row as typeof row & { subjectType: SubjectType };
}

// Which record a note belongs to, so the caller can check permissions on it
export async function getNoteSubject(workspaceId: string, id: string) {
	const row = await findNote(workspaceId, id);
	return {
		subjectType: row.subjectType,
		subjectId: row.subjectId,
		authorId: row.authorId,
	};
}

export async function createNote(
	workspaceId: string,
	actor: Actor,
	input: { subjectType: SubjectType; subjectId: string; body: string },
) {
	const { subjectType, subjectId, body } = input;
	await assertSubject(workspaceId, subjectType, subjectId, { writable: true });
	const id = uuidv7();
	await db.batch([
		db.insert(note).values({
			id,
			workspaceId,
			subjectType,
			subjectId,
			body,
			authorId: actor.type === "member" ? actor.id : null,
		}),
		eventInsert(workspaceId, actor, {
			type: `${subjectType}.note_added`,
			subjectType,
			subjectId,
			payload: { noteId: id },
		}),
	]);
	return { id };
}

// Only the author may change the text; anyone allowed to edit the record may pin
export async function updateNote(
	workspaceId: string,
	actor: Actor,
	input: { id: string; body: string; pinned: boolean },
) {
	const before = await findNote(workspaceId, input.id);
	await assertSubject(workspaceId, before.subjectType, before.subjectId, {
		writable: true,
	});
	const bodyChanged = input.body !== before.body;
	const isAuthor = actor.type === "member" && actor.id === before.authorId;
	if (bodyChanged && !isAuthor)
		throw clientError(403, m.error_note_author_only());
	if (!bodyChanged && input.pinned === before.pinned) return { id: input.id };
	await db.batch([
		db
			.update(note)
			.set({
				pinned: input.pinned,
				...(bodyChanged ? { body: input.body, updatedAt: new Date() } : {}),
			})
			.where(
				and(
					eq(note.id, input.id),
					eq(note.workspaceId, workspaceId),
					// A text edit only lands on the version the author saw
					...(bodyChanged ? [eq(note.body, before.body)] : []),
				),
			),
		eventInsert(workspaceId, actor, {
			type: bodyChanged
				? `${before.subjectType}.note_edited`
				: input.pinned
					? `${before.subjectType}.note_pinned`
					: `${before.subjectType}.note_unpinned`,
			subjectType: before.subjectType,
			subjectId: before.subjectId,
			payload: { noteId: input.id },
		}),
	]);
	return { id: input.id };
}

// The author, or someone allowed to delete records of this type (owner/admin)
export async function deleteNote(
	workspaceId: string,
	actor: Actor,
	id: string,
	canDeleteAny: boolean,
) {
	const before = await findNote(workspaceId, id);
	await assertSubject(workspaceId, before.subjectType, before.subjectId, {
		writable: true,
	});
	const isAuthor = actor.type === "member" && actor.id === before.authorId;
	if (!isAuthor && !canDeleteAny)
		throw clientError(403, m.error_note_author_only());
	await db.batch([
		db
			.delete(note)
			.where(and(eq(note.id, id), eq(note.workspaceId, workspaceId))),
		// The text is gone for good; the log keeps only that a note was deleted
		eventInsert(workspaceId, actor, {
			type: `${before.subjectType}.note_deleted`,
			subjectType: before.subjectType,
			subjectId: before.subjectId,
			payload: { noteId: id },
		}),
	]);
	return { id };
}

// --------------------------------------------------------------- timeline

// Everything shown on a record page: its tags, notes (pinned first) and events,
// newest first. Note text lives in the notes; the timeline hides the events
// that only announce a note being added or edited.
// The timeline across the sales chain (spec §11.2): a contact's timeline also
// shows the milestones of its deals, quotes, orders and invoices; a deal's,
// those of its quotes, orders and invoices. Routine edits, tags and notes of
// those records stay on their own pages.
// "_" is a LIKE wildcard, so it is escaped: ".tag_" and ".note_" match only
// themselves. Every role that reads contacts also reads deals, quotes, orders
// and invoices today; a future role without one of them (custom roles) must
// have those related events filtered out here.
const WORK_MILESTONE = sql`${event.type} in ('task.created', 'task.completed', 'activity.created', 'activity.completed')`;

const MILESTONE = sql`${event.type} not like '%.updated' and ${event.type} not like '%.tag\\_%' and ${event.type} not like '%.note\\_%'`;

function relatedEvents(
	workspaceId: string,
	subjectType: SubjectType,
	subjectId: string,
): SQL | undefined {
	// = any(array(…)) is computed once (an InitPlan), so each branch can use
	// the event (workspace_id, subject_type, subject_id) index; a plain IN
	// subquery under OR would be re-checked against every event instead
	const of = (type: string, table: string, column: string) =>
		sql`(${event.subjectType} = ${type} and ${event.subjectId} = any(array(select r."id" from ${sql.raw(`"${table}"`)} r where r."workspace_id" = ${workspaceId} and r.${sql.raw(`"${column}"`)} = ${subjectId})))`;
	// Tasks and activities about this record (on a project: its activities and
	// milestone tasks); only their creation and completion
	const work =
		subjectType === "project"
			? sql`(${WORK_MILESTONE} and ((${event.subjectType} = 'task' and ${event.subjectId} = any(array(select t."id" from "task" t where t."workspace_id" = ${workspaceId} and t."project_id" = ${subjectId} and t."is_milestone"))) or (${event.subjectType} = 'activity' and ${event.subjectId} = any(array(select a."id" from "activity" a where a."workspace_id" = ${workspaceId} and a."project_id" = ${subjectId})))))`
			: sql`(${WORK_MILESTONE} and ((${event.subjectType} = 'task' and ${event.subjectId} = any(array(select t."id" from "task" t where t."workspace_id" = ${workspaceId} and t."subject_type" = ${subjectType} and t."subject_id" = ${subjectId}))) or (${event.subjectType} = 'activity' and ${event.subjectId} = any(array(select a."id" from "activity" a where a."workspace_id" = ${workspaceId} and a."subject_type" = ${subjectType} and a."subject_id" = ${subjectId})))))`;
	if (subjectType === "contact")
		return sql`(${work} or (${MILESTONE} and (${of("deal", "deal", "contact_id")} or ${of("quote", "quote", "contact_id")} or ${of("order", "sales_order", "contact_id")} or ${of("invoice", "invoice", "contact_id")} or ${of("project", "project", "contact_id")})))`;
	if (subjectType === "deal")
		return sql`(${work} or (${MILESTONE} and (${of("quote", "quote", "deal_id")} or ${of("order", "sales_order", "deal_id")} or ${of("invoice", "invoice", "deal_id")} or ${of("project", "project", "deal_id")})))`;
	return work;
}

export async function getTimeline(
	workspaceId: string,
	subjectType: SubjectType,
	subjectId: string,
) {
	await assertSubject(workspaceId, subjectType, subjectId, { writable: false });
	const [tags, notes, events] = await Promise.all([
		recordTags(workspaceId, subjectType, subjectId),
		db
			.select({
				id: note.id,
				body: note.body,
				pinned: note.pinned,
				authorId: note.authorId,
				authorName: user.name,
				createdAt: note.createdAt,
				updatedAt: note.updatedAt,
			})
			.from(note)
			.leftJoin(user, eq(user.id, note.authorId))
			.where(
				and(
					eq(note.workspaceId, workspaceId),
					eq(note.subjectType, subjectType),
					eq(note.subjectId, subjectId),
				),
			)
			.orderBy(desc(note.pinned), desc(note.createdAt), desc(note.id))
			.limit(200),
		db
			.select({
				id: event.id,
				type: event.type,
				payload: event.payload,
				actorType: event.actorType,
				actorName: user.name,
				createdAt: event.createdAt,
				subjectType: event.subjectType,
				subjectId: event.subjectId,
				// For events of a related record: what to call it
				relatedName: sql<
					string | null
				>`(case ${event.subjectType} when 'deal' then (select d."name" from "deal" d where d."id" = ${event.subjectId} and d."workspace_id" = ${workspaceId}) when 'project' then (select pr."name" from "project" pr where pr."id" = ${event.subjectId} and pr."workspace_id" = ${workspaceId}) when 'task' then (select t."title" from "task" t where t."id" = ${event.subjectId} and t."workspace_id" = ${workspaceId}) when 'activity' then (select a."subject" from "activity" a where a."id" = ${event.subjectId} and a."workspace_id" = ${workspaceId}) end)`,
				relatedNumber: sql<
					number | null
				>`(case ${event.subjectType} when 'quote' then (select q."number" from "quote" q where q."id" = ${event.subjectId} and q."workspace_id" = ${workspaceId}) when 'order' then (select o."number" from "sales_order" o where o."id" = ${event.subjectId} and o."workspace_id" = ${workspaceId}) when 'invoice' then (select i."number" from "invoice" i where i."id" = ${event.subjectId} and i."workspace_id" = ${workspaceId}) end)`,
				relatedYear: sql<
					number | null
				>`(case when ${event.subjectType} = 'invoice' then (select i."year" from "invoice" i where i."id" = ${event.subjectId} and i."workspace_id" = ${workspaceId}) end)`,
			})
			.from(event)
			.leftJoin(user, eq(user.id, event.actorId))
			.where(
				and(
					eq(event.workspaceId, workspaceId),
					or(
						and(
							eq(event.subjectType, subjectType),
							eq(event.subjectId, subjectId),
						),
						relatedEvents(workspaceId, subjectType, subjectId),
					),
					sql`${event.type} not like '%.note_added' and ${event.type} not like '%.note_edited'`,
				),
			)
			.orderBy(desc(event.createdAt), desc(event.id))
			.limit(200),
	]);
	return { tags, notes, events };
}
