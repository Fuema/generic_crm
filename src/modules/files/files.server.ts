import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "#/db/index";
import { file, folder, organization, payment, user } from "#/db/schema";
import type { Permissions } from "#/lib/permissions";
import { assertSubject } from "#/modules/records/records.server";
import type { SubjectType } from "#/modules/records/schema";
import { m } from "#/paraglide/messages.js";
import { type Actor, eventInsert } from "#/platform/events.server";
import { uuidv7 } from "#/platform/ids";
import { fileBucket, sizedBody, storageKey } from "#/platform/storage.server";
import {
	contentTypeFor,
	FILE_LIMITS,
	fileNameSchema,
	fileRights,
	type UploadTarget,
} from "./schema";

// Server-only data layer for files and folders (spec §9). Every function takes
// the workspace id first and filters by it; the server functions in files.ts
// pass context.workspaceId from the session and check the caller's rights
// (they follow the record) before calling here. A change and its event are
// written in one db.batch (spec §11.1); the bytes go to the bucket first and
// are removed again if the batch fails.

function clientError(status: number, message: string) {
	return new Response(message, { status });
}

function errorCode(error: unknown) {
	const e = error as { code?: string; cause?: { code?: string } };
	return e?.code ?? e?.cause?.code;
}

// A one-row statement for a batch: the workspace's own row
function onWorkspace(workspaceId: string, expression: ReturnType<typeof sql>) {
	return db
		.select({ ok: expression })
		.from(organization)
		.where(eq(organization.id, workspaceId));
}

function memberActorId(actor: Actor) {
	return actor.type === "member" ? actor.id : null;
}

async function runBatch(
	statements: unknown[],
	guardMessage: () => string,
	guardStatus = 409,
) {
	try {
		await db.batch(statements as unknown as Parameters<typeof db.batch>[0]);
	} catch (error) {
		const code = errorCode(error);
		if (code === "22012") throw clientError(guardStatus, guardMessage());
		// folder_workspace_parent_name_unique
		if (code === "23505") throw clientError(409, m.error_folder_name_taken());
		// A folder deleted at the same moment as an upload or a new subfolder
		if (code === "23503") throw clientError(409, guardMessage());
		throw error;
	}
}

const fileColumns = {
	id: file.id,
	name: file.name,
	contentType: file.contentType,
	sizeBytes: file.sizeBytes,
	folderId: file.folderId,
	subjectType: file.subjectType,
	subjectId: file.subjectId,
	paymentId: file.paymentId,
	sharedWithCustomer: file.sharedWithCustomer,
	uploadedById: file.uploadedById,
	uploaderName: user.name,
	createdAt: file.createdAt,
};

// --- Files ------------------------------------------------------------------

export async function findFile(workspaceId: string, id: string) {
	const [row] = await db
		.select()
		.from(file)
		.where(and(eq(file.id, id), eq(file.workspaceId, workspaceId)))
		.limit(1);
	if (!row) throw clientError(404, m.error_file_not_found());
	return row;
}

export async function storageUsed(workspaceId: string) {
	const [{ used }] = await db
		.select({ used: sql<number>`coalesce(sum(${file.sizeBytes}), 0)::bigint` })
		.from(file)
		.where(eq(file.workspaceId, workspaceId));
	return Number(used);
}

// The target must exist in this workspace: an active record (a receipt's
// payment must belong to that invoice), or a folder
async function assertTarget(workspaceId: string, target: UploadTarget) {
	if (target.kind === "folder") {
		if (target.folderId) await findFolder(workspaceId, target.folderId);
		return;
	}
	await assertSubject(workspaceId, target.subjectType, target.subjectId, {
		writable: true,
	});
	if (target.paymentId) {
		const [p] = await db
			.select({ invoiceId: payment.invoiceId })
			.from(payment)
			.where(
				and(
					eq(payment.id, target.paymentId),
					eq(payment.workspaceId, workspaceId),
				),
			)
			.limit(1);
		if (
			!p ||
			target.subjectType !== "invoice" ||
			p.invoiceId !== target.subjectId
		)
			throw clientError(400, m.error_payment_not_found());
	}
}

// Where an event about the file goes: the record's timeline, or the file's
function eventSubject(target: {
	subjectType: string | null;
	subjectId: string | null;
	fileId: string;
}) {
	return target.subjectType && target.subjectId
		? { type: target.subjectType, id: target.subjectId }
		: { type: "file", id: target.fileId };
}

export async function uploadFile(
	workspaceId: string,
	actor: Actor,
	target: UploadTarget,
	// The body is streamed to the bucket; size is the declared length, which
	// the stream must match exactly
	upload: { name: string; size: number; body: ReadableStream },
) {
	const name = fileNameSchema.safeParse(upload.name);
	if (!name.success) throw clientError(400, name.error.issues[0].message);
	const contentType = contentTypeFor(name.data);
	if (!contentType) throw clientError(415, m.error_file_type());
	const size = upload.size;
	if (!Number.isInteger(size) || size <= 0)
		throw clientError(400, m.error_file_empty());
	if (size > FILE_LIMITS.maxFileBytes)
		throw clientError(413, m.error_file_too_large());
	await assertTarget(workspaceId, target);
	// Checked before the upload and again in the batch, so two uploads at once
	// can't pass the quota together
	if ((await storageUsed(workspaceId)) + size > FILE_LIMITS.workspaceQuotaBytes)
		throw clientError(413, m.error_storage_full());

	const id = uuidv7();
	const key = storageKey(workspaceId);
	const bucket = await fileBucket();
	try {
		await bucket.put(key, sizedBody(upload.body, size), {
			httpMetadata: { contentType },
		});
	} catch {
		await bucket.delete(key).catch(() => {});
		throw clientError(400, m.error_upload_incomplete());
	}
	// The store holds exactly the declared size (checked here where the
	// runtime can't enforce it)
	const stored = await bucket.get(key);
	if (!stored || stored.size !== size) {
		await bucket.delete(key).catch(() => {});
		throw clientError(400, m.error_upload_incomplete());
	}
	const record =
		target.kind === "record"
			? { subjectType: target.subjectType, subjectId: target.subjectId }
			: { subjectType: null, subjectId: null };
	const where = eventSubject({ ...record, fileId: id });
	try {
		await runBatch(
			[
				// One upload at a time per workspace past this point, so the quota
				// check below sees every file stored before it
				onWorkspace(
					workspaceId,
					sql`pg_advisory_xact_lock(hashtext(${`files:${workspaceId}`}))::text`,
				),
				db.insert(file).values({
					id,
					workspaceId,
					folderId: target.kind === "folder" ? target.folderId || null : null,
					...record,
					paymentId: target.kind === "record" ? target.paymentId || null : null,
					name: name.data,
					contentType,
					sizeBytes: size,
					storageKey: key,
					uploadedById: memberActorId(actor),
				}),
				// The quota, counted with this file
				onWorkspace(
					workspaceId,
					sql`1 / (case when (select coalesce(sum(f."size_bytes"), 0) from "file" f where f."workspace_id" = ${workspaceId}) <= ${FILE_LIMITS.workspaceQuotaBytes} then 1 else 0 end)`,
				),
				eventInsert(workspaceId, actor, {
					type: `${where.type}.file_added`,
					subjectType: where.type,
					subjectId: where.id,
					payload: {
						fileId: id,
						name: name.data,
						...(target.kind === "record" && target.paymentId
							? { paymentId: target.paymentId }
							: {}),
					},
				}),
			],
			() => m.error_storage_full(),
			413,
		);
	} catch (error) {
		await bucket.delete(key).catch(() => {});
		throw error;
	}
	return { id };
}

// A record file can only change while its record isn't archived
export async function assertRecordWritable(
	workspaceId: string,
	row: { subjectType: string | null; subjectId: string | null },
) {
	if (row.subjectType && row.subjectId)
		await assertSubject(
			workspaceId,
			row.subjectType as SubjectType,
			row.subjectId,
			{ writable: true },
		);
}

// Deleted for good (owner decision): the row and its event in one batch, then
// the bytes
export async function deleteFile(
	workspaceId: string,
	actor: Actor,
	row: Awaited<ReturnType<typeof findFile>>,
) {
	const where = eventSubject({ ...row, fileId: row.id });
	await runBatch(
		[
			db
				.delete(file)
				.where(and(eq(file.id, row.id), eq(file.workspaceId, workspaceId))),
			eventInsert(workspaceId, actor, {
				type: `${where.type}.file_deleted`,
				subjectType: where.type,
				subjectId: where.id,
				payload: { fileId: row.id, name: row.name },
			}),
		],
		() => m.error_file_not_found(),
	);
	const bucket = await fileBucket();
	await bucket.delete(row.storageKey).catch(() => {});
	return { id: row.id };
}

// Only a record's files can be shared: the portal shows a contact the files
// of records in their scope; workspace folders have no customer
export async function setFileShared(
	workspaceId: string,
	actor: Actor,
	row: Awaited<ReturnType<typeof findFile>>,
	shared: boolean,
) {
	if (!row.subjectType || !row.subjectId)
		throw clientError(400, m.error_file_share_record_only());
	await assertRecordWritable(workspaceId, row);
	if (row.sharedWithCustomer === shared) return { id: row.id };
	const where = eventSubject({ ...row, fileId: row.id });
	await runBatch(
		[
			db
				.update(file)
				.set({ sharedWithCustomer: shared })
				.where(and(eq(file.id, row.id), eq(file.workspaceId, workspaceId))),
			eventInsert(workspaceId, actor, {
				type: `${where.type}.${shared ? "file_shared" : "file_unshared"}`,
				subjectType: where.type,
				subjectId: where.id,
				payload: { fileId: row.id, name: row.name },
			}),
		],
		() => m.error_file_not_found(),
	);
	return { id: row.id };
}

// A record's files, newest first (an invoice's include its payment receipts)
export async function recordFiles(
	workspaceId: string,
	subjectType: SubjectType,
	subjectId: string,
) {
	return db
		.select(fileColumns)
		.from(file)
		.leftJoin(user, eq(user.id, file.uploadedById))
		.where(
			and(
				eq(file.workspaceId, workspaceId),
				eq(file.subjectType, subjectType),
				eq(file.subjectId, subjectId),
			),
		)
		.orderBy(desc(file.createdAt), desc(file.id))
		.limit(FILE_LIMITS.listed);
}
export type FileRow = Awaited<ReturnType<typeof recordFiles>>[number];

// The bytes of a file, for the download route
export async function openFile(storage: { storageKey: string }) {
	const bucket = await fileBucket();
	return bucket.get(storage.storageKey);
}

// --- Folders ----------------------------------------------------------------

export async function findFolder(workspaceId: string, id: string) {
	const [row] = await db
		.select()
		.from(folder)
		.where(and(eq(folder.id, id), eq(folder.workspaceId, workspaceId)))
		.limit(1);
	if (!row) throw clientError(404, m.error_folder_not_found());
	return row;
}

// SQL for a folder's depth (1 = top level) and its subtree's height (1 = no
// subfolders), for guards inside a batch
function depthOf(workspaceId: string, id: string) {
	return sql`with recursive up as (select f."id", f."parent_id", 1 as lvl from "folder" f where f."id" = ${id} and f."workspace_id" = ${workspaceId} union all select p."id", p."parent_id", up.lvl + 1 from "folder" p join up on p."id" = up."parent_id" where p."workspace_id" = ${workspaceId} and up.lvl < 50) select coalesce(max(lvl), 0) from up`;
}
function heightOf(workspaceId: string, id: string) {
	return sql`with recursive down as (select f."id", 1 as lvl from "folder" f where f."id" = ${id} and f."workspace_id" = ${workspaceId} union all select c."id", down.lvl + 1 from "folder" c join down on c."parent_id" = down."id" where c."workspace_id" = ${workspaceId} and down.lvl < 50) select coalesce(max(lvl), 1) from down`;
}

// A folder and its ancestors, top level first (also its depth)
async function folderPath(workspaceId: string, id: string) {
	const rows = await db.execute(
		sql`with recursive up as (select f."id", f."parent_id", f."name", 1 as lvl from "folder" f where f."id" = ${id} and f."workspace_id" = ${workspaceId} union all select p."id", p."parent_id", p."name", up.lvl + 1 from "folder" p join up on p."id" = up."parent_id" where p."workspace_id" = ${workspaceId} and up.lvl < 50) select "id", "name", lvl from up order by lvl desc`,
	);
	return (rows.rows as { id: string; name: string }[]).map((r) => ({
		id: r.id,
		name: r.name,
	}));
}

// How many levels a folder's subtree adds below it (1 = no subfolders)
async function subtreeHeight(workspaceId: string, id: string) {
	const rows = await db.execute(
		sql`with recursive down as (select f."id", 1 as lvl from "folder" f where f."id" = ${id} and f."workspace_id" = ${workspaceId} union all select c."id", down.lvl + 1 from "folder" c join down on c."parent_id" = down."id" where c."workspace_id" = ${workspaceId} and down.lvl < 50) select coalesce(max(lvl), 1)::int as height from down`,
	);
	return Number((rows.rows[0] as { height: number }).height ?? 1);
}

export async function listFolder(workspaceId: string, folderId: string | null) {
	const current = folderId ? await findFolder(workspaceId, folderId) : null;
	const [path, folders, files, used] = await Promise.all([
		folderId ? folderPath(workspaceId, folderId) : Promise.resolve([]),
		db
			.select({ id: folder.id, name: folder.name, updatedAt: folder.updatedAt })
			.from(folder)
			.where(
				and(
					eq(folder.workspaceId, workspaceId),
					folderId ? eq(folder.parentId, folderId) : isNull(folder.parentId),
				),
			)
			.orderBy(asc(sql`lower(${folder.name})`))
			.limit(FILE_LIMITS.listed),
		db
			.select(fileColumns)
			.from(file)
			.leftJoin(user, eq(user.id, file.uploadedById))
			.where(
				and(
					eq(file.workspaceId, workspaceId),
					isNull(file.subjectType),
					folderId ? eq(file.folderId, folderId) : isNull(file.folderId),
				),
			)
			.orderBy(asc(sql`lower(${file.name})`))
			.limit(FILE_LIMITS.listed),
		storageUsed(workspaceId),
	]);
	return {
		folder: current,
		path,
		folders,
		files,
		usage: { used, quota: FILE_LIMITS.workspaceQuotaBytes },
	};
}

export async function createFolder(
	workspaceId: string,
	actor: Actor,
	data: { name: string; parentId: string },
) {
	if (data.parentId) {
		await findFolder(workspaceId, data.parentId);
		const depth = (await folderPath(workspaceId, data.parentId)).length;
		if (depth >= FILE_LIMITS.folderDepth)
			throw clientError(409, m.error_folder_too_deep());
	}
	const id = uuidv7();
	await runBatch(
		[
			// Tree changes one at a time per workspace, so the depth checks
			// below see every change before them
			onWorkspace(
				workspaceId,
				sql`pg_advisory_xact_lock(hashtext(${`folders:${workspaceId}`}))::text`,
			),
			...(data.parentId
				? [
						onWorkspace(
							workspaceId,
							sql`1 / (case when (${depthOf(workspaceId, data.parentId)}) < ${FILE_LIMITS.folderDepth} then 1 else 0 end)`,
						),
					]
				: []),
			db.insert(folder).values({
				id,
				workspaceId,
				parentId: data.parentId || null,
				name: data.name,
				createdById: memberActorId(actor),
			}),
			eventInsert(workspaceId, actor, {
				type: "folder.created",
				subjectType: "folder",
				subjectId: id,
				payload: { name: data.name },
			}),
		],
		() => m.error_folder_too_deep(),
	);
	return { id };
}

export async function renameFolder(
	workspaceId: string,
	actor: Actor,
	data: { id: string; name: string },
) {
	const before = await findFolder(workspaceId, data.id);
	if (before.name === data.name) return { id: data.id };
	await runBatch(
		[
			db
				.update(folder)
				.set({ name: data.name, updatedAt: new Date() })
				.where(
					and(eq(folder.id, data.id), eq(folder.workspaceId, workspaceId)),
				),
			eventInsert(workspaceId, actor, {
				type: "folder.renamed",
				subjectType: "folder",
				subjectId: data.id,
				payload: { from: before.name, to: data.name },
			}),
		],
		() => m.error_folder_not_found(),
	);
	return { id: data.id };
}

// Into another folder or the top level; never into itself or its own
// subfolders, and never deeper than the limit
export async function moveFolder(
	workspaceId: string,
	actor: Actor,
	data: { id: string; parentId: string },
) {
	const before = await findFolder(workspaceId, data.id);
	const parentId = data.parentId || null;
	if ((before.parentId ?? null) === parentId) return { id: data.id };
	if (parentId) {
		await findFolder(workspaceId, parentId);
		const path = await folderPath(workspaceId, parentId);
		if (path.some((p) => p.id === data.id))
			throw clientError(409, m.error_folder_into_itself());
		const height = await subtreeHeight(workspaceId, data.id);
		if (path.length + height > FILE_LIMITS.folderDepth)
			throw clientError(409, m.error_folder_too_deep());
	}
	await runBatch(
		[
			onWorkspace(
				workspaceId,
				sql`pg_advisory_xact_lock(hashtext(${`folders:${workspaceId}`}))::text`,
			),
			db
				.update(folder)
				.set({ parentId, updatedAt: new Date() })
				.where(
					and(eq(folder.id, data.id), eq(folder.workspaceId, workspaceId)),
				),
			// The new parent isn't inside the moved folder, also after a move
			// that happened meanwhile
			...(parentId
				? [
						onWorkspace(
							workspaceId,
							sql`1 / (case when exists (with recursive up as (select f."id", f."parent_id", 1 as lvl from "folder" f where f."id" = ${parentId} and f."workspace_id" = ${workspaceId} union all select p."id", p."parent_id", up.lvl + 1 from "folder" p join up on p."id" = up."parent_id" where p."workspace_id" = ${workspaceId} and up.lvl < 50) select 1 from up where up."parent_id" = ${data.id} or up."id" = ${data.id}) then 0 else 1 end)`,
						),
						// ...and the result stays within the depth limit
						onWorkspace(
							workspaceId,
							sql`1 / (case when (${depthOf(workspaceId, parentId)}) + (${heightOf(workspaceId, data.id)}) <= ${FILE_LIMITS.folderDepth} then 1 else 0 end)`,
						),
					]
				: []),
			eventInsert(workspaceId, actor, {
				type: "folder.moved",
				subjectType: "folder",
				subjectId: data.id,
				payload: { from: before.parentId, to: parentId },
			}),
		],
		() => m.error_folder_cannot_move(),
	);
	return { id: data.id };
}

// Only an empty folder: checked in the delete itself
export async function deleteFolder(
	workspaceId: string,
	actor: Actor,
	id: string,
) {
	const before = await findFolder(workspaceId, id);
	await runBatch(
		[
			onWorkspace(
				workspaceId,
				sql`1 / (case when exists (select 1 from "folder" c where c."parent_id" = ${id} and c."workspace_id" = ${workspaceId}) or exists (select 1 from "file" f where f."folder_id" = ${id} and f."workspace_id" = ${workspaceId}) then 0 else 1 end)`,
			),
			db
				.delete(folder)
				.where(and(eq(folder.id, id), eq(folder.workspaceId, workspaceId))),
			eventInsert(workspaceId, actor, {
				type: "folder.deleted",
				subjectType: "folder",
				subjectId: id,
				payload: { name: before.name },
			}),
		],
		() => m.error_folder_not_empty(),
	);
	return { id };
}

// Every folder of the workspace, for the move picker
export async function allFolders(workspaceId: string) {
	return db
		.select({ id: folder.id, name: folder.name, parentId: folder.parentId })
		.from(folder)
		.where(eq(folder.workspaceId, workspaceId))
		.orderBy(asc(sql`lower(${folder.name})`))
		.limit(1000);
}

// --- Downloads --------------------------------------------------------------

const DOWNLOAD_ID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Who may download a file (spec §9), for the download route: a session with an
// active workspace, the file in that workspace, and the right to read its
// record (or, for workspace folders, files). A missing right answers like a
// missing file, so nothing hints that it exists. `can` checks the caller's
// role in that workspace (Better Auth in the route; the same role table in
// tests).
export async function authorizeDownload(
	// `can` must check the caller's role in exactly this workspaceId
	access: {
		workspaceId: string | null;
		can: (permissions: Permissions) => Promise<boolean>;
	} | null,
	fileId: string,
): Promise<
	| { ok: true; row: Awaited<ReturnType<typeof findFile>> }
	| { ok: false; status: 401 | 403 | 404 }
> {
	if (!access) return { ok: false, status: 401 };
	if (!access.workspaceId) return { ok: false, status: 403 };
	if (!DOWNLOAD_ID.test(fileId)) return { ok: false, status: 404 };
	const [row] = await db
		.select()
		.from(file)
		.where(and(eq(file.id, fileId), eq(file.workspaceId, access.workspaceId)))
		.limit(1);
	if (!row) return { ok: false, status: 404 };
	if (!(await access.can(fileRights(row, "read"))))
		return { ok: false, status: 404 };
	return { ok: true, row };
}
